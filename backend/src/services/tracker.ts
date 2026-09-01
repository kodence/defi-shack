import { NETWORKS, STABLECOINS } from "../constants";
import { querySubgraph, fetchAllTokenDayDatas } from "./subgraph";
import { SubgraphTokenDayData } from "../types/subgraph";
import {
  TrackedPosition, TrackedBenchmark, SmartFlag,
} from "../types/track";
import {
  getAmounts, tickToAdjPrice, uint256Delta, rawTokensFromDelta,
} from "../core/math";
import { feeLabelOf } from "../core/context";

// ── Raw subgraph shapes ───────────────────────────────────────────────────────
interface RawTick {
  tickIdx: string;
  feeGrowthOutside0X128: string;
  feeGrowthOutside1X128: string;
}

interface RawPosition {
  id: string;
  liquidity: string;
  depositedToken0: string;
  depositedToken1: string;
  withdrawnToken0: string;
  withdrawnToken1: string;
  feeGrowthInside0LastX128: string;
  feeGrowthInside1LastX128: string;
  transaction: { timestamp: string } | null;
  tickLower: RawTick;
  tickUpper: RawTick;
  pool: {
    id: string;
    feeTier: string;
    tick: string | null;
    feeGrowthGlobal0X128: string;
    feeGrowthGlobal1X128: string;
    token0: { id: string; symbol: string; decimals: string; derivedETH: string };
    token1: { id: string; symbol: string; decimals: string; derivedETH: string };
  };
}

interface PositionsQueryResponse {
  positions: RawPosition[];
  bundle: { ethPriceUSD: string } | null;
}

// ── Cache (short TTL — tracking should be fresh) ──────────────────────────────
const TRACK_TTL_MS = 60_000;
const cache = new Map<string, { promise: Promise<TrackedPosition[]>; at: number }>();

export function getTrackedPositions(network: string, address: string): Promise<TrackedPosition[]> {
  const key = `${network}:${address.toLowerCase()}`;
  const entry = cache.get(key);
  if (entry && Date.now() - entry.at < TRACK_TTL_MS) return entry.promise;
  const promise = fetchPositions(network, address.toLowerCase());
  cache.set(key, { promise, at: Date.now() });
  promise.catch(() => cache.delete(key));
  return promise;
}

// ── Fetch + compute ───────────────────────────────────────────────────────────
async function fetchPositions(network: string, address: string): Promise<TrackedPosition[]> {
  const config = NETWORKS[network];
  if (!config) throw new Error(`Unknown network: ${network}`);
  const url = config.subgraphUrl;

  const data = await querySubgraph<PositionsQueryResponse>(`{
    positions(first: 200, where: { owner: "${address}", liquidity_gt: "0" }) {
      id
      liquidity
      depositedToken0 depositedToken1
      withdrawnToken0 withdrawnToken1
      feeGrowthInside0LastX128 feeGrowthInside1LastX128
      transaction { timestamp }
      tickLower { tickIdx feeGrowthOutside0X128 feeGrowthOutside1X128 }
      tickUpper { tickIdx feeGrowthOutside0X128 feeGrowthOutside1X128 }
      pool {
        id feeTier tick
        feeGrowthGlobal0X128 feeGrowthGlobal1X128
        token0 { id symbol decimals derivedETH }
        token1 { id symbol decimals derivedETH }
      }
    }
    bundle(id: "1") { ethPriceUSD }
  }`, url);

  const positions = data.positions.filter(p => p.pool.tick !== null);
  if (!positions.length) return [];
  const ethUsd = parseFloat(data.bundle?.ethPriceUSD ?? "0");

  // Entry-day token prices: one batched fetch across all involved tokens
  const tokenIds = new Set<string>();
  let earliest = Math.floor(Date.now() / 1000);
  for (const p of positions) {
    tokenIds.add(p.pool.token0.id);
    tokenIds.add(p.pool.token1.id);
    const ts = parseInt(p.transaction?.timestamp ?? "0", 10);
    if (ts > 0) earliest = Math.min(earliest, ts);
  }
  const tokenDays = await fetchAllTokenDayDatas([...tokenIds], earliest - 2 * 86_400, url);

  return positions.map(p => computePosition(p, network, config.name, ethUsd, tokenDays));
}

// Price of a token on the entry day (tokenDayDatas are date-desc)
function priceAt(days: SubgraphTokenDayData[] | undefined, ts: number): number | null {
  if (!days?.length) return null;
  for (const d of days) {
    if (d.date <= ts) {
      const v = parseFloat(d.priceUSD);
      return v > 0 ? v : null;
    }
  }
  const oldest = parseFloat(days[days.length - 1].priceUSD);
  return oldest > 0 ? oldest : null;
}

function computePosition(
  p: RawPosition,
  network: string,
  networkName: string,
  ethUsd: number,
  tokenDays: Map<string, SubgraphTokenDayData[]>,
): TrackedPosition {
  const t0 = p.pool.token0, t1 = p.pool.token1;
  const d0 = parseInt(t0.decimals, 10), d1 = parseInt(t1.decimals, 10);
  const tick = parseInt(p.pool.tick!, 10);
  const tickLo = parseInt(p.tickLower.tickIdx, 10);
  const tickHi = parseInt(p.tickUpper.tickIdx, 10);

  // Current USD prices (derivedETH; day-data fallback)
  let p0 = parseFloat(t0.derivedETH) * ethUsd;
  let p1 = parseFloat(t1.derivedETH) * ethUsd;
  if (p0 <= 0) p0 = priceAt(tokenDays.get(t0.id), Math.floor(Date.now() / 1000)) ?? 0;
  if (p1 <= 0) p1 = priceAt(tokenDays.get(t1.id), Math.floor(Date.now() / 1000)) ?? 0;

  // Canonical adjusted prices (token1 per token0) and current token amounts
  const pAdj = tickToAdjPrice(tick, d0, d1);
  const pAdjLo = tickToAdjPrice(tickLo, d0, d1);
  const pAdjHi = tickToAdjPrice(tickHi, d0, d1);
  const lRaw = parseFloat(p.liquidity);
  const lAdj = lRaw / Math.pow(10, (d0 + d1) / 2);
  const [amt0, amt1] = getAmounts(lAdj, pAdj, pAdjLo, pAdjHi);
  const positionValueUsd = amt0 * p0 + amt1 * p1;
  const inRange = tick >= tickLo && tick < tickHi;

  // Uncollected fees via feeGrowth deltas (all uint256 wrap-around arithmetic)
  const L = BigInt(p.liquidity);
  const inside0 = feeGrowthInside(
    BigInt(p.pool.feeGrowthGlobal0X128),
    BigInt(p.tickLower.feeGrowthOutside0X128), BigInt(p.tickUpper.feeGrowthOutside0X128),
    tickLo, tickHi, tick,
  );
  const inside1 = feeGrowthInside(
    BigInt(p.pool.feeGrowthGlobal1X128),
    BigInt(p.tickLower.feeGrowthOutside1X128), BigInt(p.tickUpper.feeGrowthOutside1X128),
    tickLo, tickHi, tick,
  );
  const unclaimed0 =
    Number(rawTokensFromDelta(L, uint256Delta(inside0, BigInt(p.feeGrowthInside0LastX128)))) / Math.pow(10, d0);
  const unclaimed1 =
    Number(rawTokensFromDelta(L, uint256Delta(inside1, BigInt(p.feeGrowthInside1LastX128)))) / Math.pow(10, d1);

  // collectedFeesToken* is corrupted in the deployed subgraph (token1 mirrors
  // token0) — earnings are the exactly-computable unclaimed fees only.
  const dep0 = parseFloat(p.depositedToken0), dep1 = parseFloat(p.depositedToken1);
  const wd0 = parseFloat(p.withdrawnToken0), wd1 = parseFloat(p.withdrawnToken1);
  const earningsUsd = unclaimed0 * p0 + unclaimed1 * p1;

  // Entry-day prices for the benchmark strategies
  const entryTs = parseInt(p.transaction?.timestamp ?? "0", 10);
  let p0e = priceAt(tokenDays.get(t0.id), entryTs);
  let p1e = priceAt(tokenDays.get(t1.id), entryTs);
  const entryApprox = p0e === null || p1e === null;
  if (p0e === null) p0e = p0;
  if (p1e === null) p1e = p1;
  const depositUsdAtEntry = dep0 * p0e + dep1 * p1e;

  // "What if I had held…" — each valued at current prices
  const lpNow = positionValueUsd + earningsUsd;
  const hodlInitial = dep0 * p0 + dep1 * p1;
  const bench = (label: string, hodl: number): TrackedBenchmark => ({
    label, hodlValueUsd: hodl, netUsd: lpNow - hodl,
  });
  const benchmarks: TrackedBenchmark[] = [
    bench("Initial assets", hodlInitial),
    bench("50/50 split", p0e > 0 && p1e > 0
      ? (depositUsdAtEntry / 2 / p0e) * p0 + (depositUsdAtEntry / 2 / p1e) * p1
      : hodlInitial),
    bench(`All ${t0.symbol}`, p0e > 0 ? (depositUsdAtEntry / p0e) * p0 : hodlInitial),
    bench(`All ${t1.symbol}`, p1e > 0 ? (depositUsdAtEntry / p1e) * p1 : hodlInitial),
  ];

  const divergenceLossUsd = positionValueUsd - hodlInitial;
  const netVsHodlUsd = lpNow - hodlInitial;
  const earningsRetention = earningsUsd > 0 ? netVsHodlUsd / earningsUsd : 0;

  const now = Math.floor(Date.now() / 1000);
  const daysHeld = Math.max((now - entryTs) / 86_400, 0.04);
  const aprSinceEntry = depositUsdAtEntry > 0
    ? (earningsUsd / depositUsdAtEntry) * (365 / daysHeld)
    : 0;

  // Orientation for display: stablecoin (or the pricier token) as quote
  const s0 = STABLECOINS.has(t0.symbol), s1 = STABLECOINS.has(t1.symbol);
  const baseIs0 = s1 && !s0 ? true : s0 && !s1 ? false : pAdj >= 1;
  const orient = (v: number) => (baseIs0 ? v : v > 0 ? 1 / v : 0);
  const currentPrice = orient(pAdj);
  const lowerPrice = baseIs0 ? pAdjLo : orient(pAdjHi);
  const upperPrice = baseIs0 ? pAdjHi : orient(pAdjLo);
  const [baseSymbol, quoteSymbol] = baseIs0 ? [t0.symbol, t1.symbol] : [t1.symbol, t0.symbol];

  // SMART rebalancing flags
  const smart: SmartFlag[] = [];
  if (!inRange) {
    const beyond = tick < tickLo
      ? (baseIs0 ? pAdjLo / pAdj - 1 : pAdj / pAdjLo - 1)
      : (baseIs0 ? pAdj / pAdjHi - 1 : pAdjHi / pAdj - 1);
    const side = (tick < tickLo) === baseIs0 ? "below" : "above";
    smart.push({
      kind: "out-of-range", severity: "bad",
      message: `Out of range (${side}) by ${(Math.abs(beyond) * 100).toFixed(1)}% — not earning. SMART: wait 48–72h unless clearly deteriorating.`,
    });
  } else {
    const width = upperPrice - lowerPrice;
    const edgeDist = Math.min(currentPrice - lowerPrice, upperPrice - currentPrice) / Math.max(width, 1e-12);
    if (edgeDist < 0.15) {
      smart.push({
        kind: "near-edge", severity: "warn",
        message: `Price is within ${(edgeDist * 100).toFixed(0)}% of a range edge — consider a re-center plan before it exits.`,
      });
    }
  }
  if (p0e > 0 && p1e > 0) {
    const entryPair = p0e / p1e;   // ≈ token1 per token0 at entry
    if (entryPair > 0 && Math.abs(pAdj - entryPair) / entryPair < 0.02) {
      smart.push({
        kind: "near-entry", severity: "good",
        message: "Price is back at your entry (±2%) — a rebalance here locks in ~zero divergence loss.",
      });
    }
  }

  return {
    positionId: p.id,
    network, networkName,
    poolId: p.pool.id,
    poolName: `${baseSymbol} / ${quoteSymbol}`,
    feeLabel: feeLabelOf(parseInt(p.pool.feeTier, 10)),
    baseSymbol, quoteSymbol,
    inRange, currentPrice, lowerPrice, upperPrice,
    baseAmount: baseIs0 ? amt0 : amt1,
    quoteAmount: baseIs0 ? amt1 : amt0,
    positionValueUsd,
    depositedBase: baseIs0 ? dep0 : dep1,
    depositedQuote: baseIs0 ? dep1 : dep0,
    withdrawnBase: baseIs0 ? wd0 : wd1,
    withdrawnQuote: baseIs0 ? wd1 : wd0,
    depositUsdAtEntry,
    entryTimestamp: entryTs,
    entryApprox,
    earnings: {
      unclaimedBase: baseIs0 ? unclaimed0 : unclaimed1,
      unclaimedQuote: baseIs0 ? unclaimed1 : unclaimed0,
      totalUsd: earningsUsd,
    },
    benchmarks,
    divergenceLossUsd,
    netVsHodlUsd,
    earningsRetention,
    aprSinceEntry,
    daysHeld,
    smart,
  };
}

// Standard Uniswap V3 fee accounting: growth inside a tick range, with
// uint256 wrap-around on every subtraction.
function feeGrowthInside(
  global: bigint, fgoLower: bigint, fgoUpper: bigint,
  tickLower: number, tickUpper: number, tickCurrent: number,
): bigint {
  const below = tickCurrent >= tickLower ? fgoLower : uint256Delta(global, fgoLower);
  const above = tickCurrent < tickUpper ? fgoUpper : uint256Delta(global, fgoUpper);
  return uint256Delta(uint256Delta(global, below), above);
}
