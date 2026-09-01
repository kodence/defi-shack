import { NETWORKS, CACHE_TTL_MS } from "../constants";
import { querySubgraph } from "./subgraph";
import {
  PoolMetaQueryResponse,
  PoolSnapshotQueryResponse,
  TicksPageQueryResponse,
  SubgraphTick,
} from "../types/subgraph";
import { MIN_TICK, MAX_TICK } from "../core/math";

// ── Snapshot shape (canonical token0/token1 orientation, ascending dates) ─────
export interface SnapshotToken {
  id:       string;
  symbol:   string;
  decimals: number;
  priceUsd: number;
}

export interface SnapshotDay {
  date:      number;
  tvlUsd:    number;
  volumeUsd: number;
  feesUsd:   number;
  // OHLC of token0Price (token0 per token1), as stored by the subgraph
  open:  number;
  high:  number;
  low:   number;
  close: number;
}

export interface TokenPriceDay {
  date:     number;
  priceUsd: number;
}

export interface LivePoolSnapshot {
  network:      string;
  networkName:  string;
  poolId:       string;
  feeTier:      number;
  token0:       SnapshotToken;
  token1:       SnapshotToken;
  tick:         number;
  liquidityRaw: number;       // active liquidity at current tick
  tvlUsd:       number;
  token0Price:  number;       // current token0-per-token1 price
  dayDatas:     SnapshotDay[];       // ascending
  token0Days:   TokenPriceDay[];     // ascending
  token1Days:   TokenPriceDay[];     // ascending
  ticks:        { tickIdx: number; liquidityNet: number }[];  // ascending, windowed
  tickWindow:   { lo: number; hi: number };
  ticksClipped: boolean;      // hit the pagination cap
  fetchedAt:    number;
}

// Window ≈ price ×/÷ 2.5 around the current tick (ln(2.5)/ln(1.0001) ≈ 9163)
const TICK_WINDOW = 9200;
const HISTORY_DAYS = 365;
const MAX_TICK_PAGES = 3;

// ── TTL cache with in-flight coalescing ───────────────────────────────────────
const cache = new Map<string, { promise: Promise<LivePoolSnapshot>; at: number }>();

export function getPoolSnapshot(network: string, poolId: string): Promise<LivePoolSnapshot> {
  const key = `${network}:${poolId.toLowerCase()}`;
  const entry = cache.get(key);
  if (entry && Date.now() - entry.at < CACHE_TTL_MS) return entry.promise;

  const promise = fetchSnapshot(network, poolId.toLowerCase());
  cache.set(key, { promise, at: Date.now() });
  promise.catch(() => cache.delete(key));  // failed fetches shouldn't poison the cache
  return promise;
}

// ── Fetching ──────────────────────────────────────────────────────────────────
async function fetchSnapshot(network: string, poolId: string): Promise<LivePoolSnapshot> {
  const config = NETWORKS[network];
  if (!config) throw new Error(`Unknown network: ${network}`);
  const url = config.subgraphUrl;

  // Query 1: pool metadata (tokens, decimals, USD pricing via derivedETH)
  const meta = await querySubgraph<PoolMetaQueryResponse>(`{
    pool(id: "${poolId}") {
      id feeTier tick liquidity sqrtPrice totalValueLockedUSD
      token0 { id symbol decimals derivedETH }
      token1 { id symbol decimals derivedETH }
    }
    bundle(id: "1") { ethPriceUSD }
  }`, url);

  if (!meta.pool) throw new Error("Pool not found on this network");
  if (meta.pool.tick === null) throw new Error("Pool has no active liquidity");

  const ethUsd = parseFloat(meta.bundle?.ethPriceUSD ?? "0");
  const tick = parseInt(meta.pool.tick, 10);
  const lo = Math.max(tick - TICK_WINDOW, MIN_TICK);
  const hi = Math.min(tick + TICK_WINDOW, MAX_TICK);
  const startTs = Math.floor(Date.now() / 1000) - HISTORY_DAYS * 86_400;

  // Query 2: anchor + windowed ticks + pool/token history, one HTTP round trip.
  // The anchor (tick, liquidity) is re-read here so it's consistent with the
  // tick list — a swap between the two queries would skew the walk otherwise.
  const data = await querySubgraph<PoolSnapshotQueryResponse>(`{
    pool(id: "${poolId}") { tick liquidity }
    ticks(
      first: 1000
      orderBy: tickIdx
      orderDirection: asc
      where: { pool: "${poolId}", tickIdx_gte: ${lo}, tickIdx_lte: ${hi}, liquidityNet_not: "0" }
    ) { tickIdx liquidityNet }
    poolDayDatas(
      first: ${HISTORY_DAYS}
      orderBy: date
      orderDirection: desc
      where: { pool: "${poolId}", date_gte: ${startTs} }
    ) { date feesUSD volumeUSD tvlUSD open high low close token0Price }
    t0: tokenDayDatas(
      first: ${HISTORY_DAYS}
      orderBy: date
      orderDirection: desc
      where: { token: "${meta.pool.token0.id}", date_gte: ${startTs} }
    ) { date priceUSD }
    t1: tokenDayDatas(
      first: ${HISTORY_DAYS}
      orderBy: date
      orderDirection: desc
      where: { token: "${meta.pool.token1.id}", date_gte: ${startTs} }
    ) { date priceUSD }
  }`, url);

  if (!data.pool || data.pool.tick === null) throw new Error("Pool has no active liquidity");

  // Cursor-paginate remaining ticks (rare: only very dense 0.01%/0.05% pools)
  let allTicks: SubgraphTick[] = data.ticks;
  let clipped = false;
  let pages = 1;
  while (allTicks.length > 0 && allTicks.length % 1000 === 0 && pages < MAX_TICK_PAGES + 1) {
    const cursor = allTicks[allTicks.length - 1].tickIdx;
    const page = await querySubgraph<TicksPageQueryResponse>(`{
      ticks(
        first: 1000
        orderBy: tickIdx
        orderDirection: asc
        where: { pool: "${poolId}", tickIdx_gt: ${cursor}, tickIdx_lte: ${hi}, liquidityNet_not: "0" }
      ) { tickIdx liquidityNet }
    }`, url);
    if (page.ticks.length === 0) break;
    allTicks = allTicks.concat(page.ticks);
    pages++;
    if (pages > MAX_TICK_PAGES && page.ticks.length === 1000) { clipped = true; break; }
  }

  const tokenUsd = (derivedETH: string, days: TokenPriceDay[]): number => {
    const viaEth = parseFloat(derivedETH) * ethUsd;
    if (viaEth > 0) return viaEth;
    return days.length ? days[days.length - 1].priceUsd : 0;
  };

  const token0Days = data.t0
    .map(d => ({ date: d.date, priceUsd: parseFloat(d.priceUSD) }))
    .reverse();
  const token1Days = data.t1
    .map(d => ({ date: d.date, priceUsd: parseFloat(d.priceUSD) }))
    .reverse();

  const dayDatas: SnapshotDay[] = data.poolDayDatas
    .map(d => {
      const close = parseFloat(d.close) > 0 ? parseFloat(d.close) : parseFloat(d.token0Price);
      const open  = parseFloat(d.open)  > 0 ? parseFloat(d.open)  : close;
      const high  = parseFloat(d.high)  > 0 ? parseFloat(d.high)  : Math.max(open, close);
      const low   = parseFloat(d.low)   > 0 ? parseFloat(d.low)   : Math.min(open, close);
      return {
        date: d.date,
        tvlUsd: parseFloat(d.tvlUSD),
        volumeUsd: parseFloat(d.volumeUSD),
        feesUsd: parseFloat(d.feesUSD),
        open, high, low, close,
      };
    })
    .filter(d => d.close > 0)
    .reverse();

  return {
    network,
    networkName: config.name,
    poolId,
    feeTier: parseInt(meta.pool.feeTier, 10),
    token0: {
      id: meta.pool.token0.id,
      symbol: meta.pool.token0.symbol,
      decimals: parseInt(meta.pool.token0.decimals, 10),
      priceUsd: tokenUsd(meta.pool.token0.derivedETH, token0Days),
    },
    token1: {
      id: meta.pool.token1.id,
      symbol: meta.pool.token1.symbol,
      decimals: parseInt(meta.pool.token1.decimals, 10),
      priceUsd: tokenUsd(meta.pool.token1.derivedETH, token1Days),
    },
    tick: parseInt(data.pool.tick, 10),
    liquidityRaw: parseFloat(data.pool.liquidity),
    tvlUsd: parseFloat(meta.pool.totalValueLockedUSD),
    token0Price: dayDatas.length ? dayDatas[dayDatas.length - 1].close : 0,
    dayDatas,
    token0Days,
    token1Days,
    ticks: allTicks.map(t => ({
      tickIdx: parseInt(t.tickIdx, 10),
      liquidityNet: parseFloat(t.liquidityNet),
    })),
    tickWindow: { lo, hi },
    ticksClipped: clipped,
    fetchedAt: Date.now(),
  };
}
