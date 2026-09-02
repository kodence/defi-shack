import { SourceConfig, Timeframe, TVL_FLOOR, TVL_CEILING } from "../../constants";
import { computePoolLiquidity } from "../poolLiquidity";
import {
  computeAvgDailyFees, computeAPRFromSeries, computeFeeToTvl, usableDays,
} from "../metrics";
import { SubgraphPool, SubgraphPoolDayData, SubgraphTickLite } from "../../types/subgraph";
import { ComputedPool } from "../../types/pool";
import { coefficientOfVariation, getJson, mapWithConcurrency, poolLabel } from "./common";

// PancakeSwap's explorer API -- the backend of pancakeswap.finance/info. It
// is undocumented, but it is the only live source for Pancake V3 on BSC and
// Arbitrum: both of Pancake's own subgraphs for those chains are broken on
// The Graph, and Messari's BSC indexing stopped a month ago.
//
// What it carries: a top-pools list with current TVL and 24h/7d rollups, a
// daily fee chart going back a year, a daily volume chart for the last 30
// days, and the full tick list. What it lacks: any token price history, so
// volatility and correlation cannot be derived, and any daily TVL series, so
// the APR denominator is today's reconstructed TVL rather than an average.

const CHAIN: Record<string, string> = {
  bsc: "bsc", arbitrum: "arbitrum", ethereum: "ethereum", base: "base",
};

interface ExplorerToken { id: string; symbol: string; decimals: number }
interface ExplorerPool {
  id: string;
  token0: ExplorerToken;
  token1: ExplorerToken;
  feeTier: number;
  liquidity: string;
  tick: number | null;
  token0Price: number;     // token0 per token1, as in the subgraph
  tvlToken0: number;
  tvlToken1: number;
  tvlUSD: number;
  isBlacklisted: boolean;
}
interface Bucket { bucket: string; feeUSD?: string; volumeUSD?: string }
interface TicksPage {
  rows: { tickIdx: number; liquidityNet: string }[];
  hasNextPage: boolean;
  endCursor: string;
}

const TICK_PAGES = 3;

async function fetchTicks(base: string, chain: string, poolId: string): Promise<{ ticks: SubgraphTickLite[]; clipped: boolean }> {
  const ticks: SubgraphTickLite[] = [];
  let after: string | null = null;
  for (let page = 0; page < TICK_PAGES; page++) {
    // Annotated: the loop assigns `after` from `data`, and TS otherwise sees
    // the narrowing of `after` here as depending on `data`, i.e. on itself.
    const url: string = `${base}/pools/ticks/v3/${chain}/${poolId}${after ? `?after=${encodeURIComponent(after)}` : ""}`;
    const data: TicksPage = await getJson<TicksPage>(url);
    const before = ticks.length;
    for (const r of data.rows) {
      if (r.liquidityNet !== "0") ticks.push({ tickIdx: String(r.tickIdx), liquidityNet: r.liquidityNet });
    }
    // The cursor parameter name is not documented; if a page repeats, stop
    // rather than loop.
    if (!data.hasNextPage || ticks.length === before) return { ticks, clipped: data.hasNextPage };
    after = data.endCursor;
  }
  return { ticks, clipped: true };
}

// Day-bucket timestamps are ISO midnights; the pipeline keys days by unix seconds
const dayOf = (iso: string) => Math.floor(Date.parse(iso) / 1000);

export async function fetchPancakeExplorerDiscovery(
  source: SourceConfig,
  timeframe: Timeframe,
  startTimestamp: number
): Promise<ComputedPool[]> {
  const chain = CHAIN[source.network];
  if (!chain) throw new Error(`PancakeSwap explorer has no chain mapping for ${source.network}`);
  const base = source.url;

  // Every numeric field arrives as a string; coerce once, here
  const num = (v: unknown): number => (typeof v === "number" ? v : parseFloat(String(v)));
  const raw = await getJson<ExplorerPool[]>(`${base}/pools/v3/${chain}/list/top`);
  const list: ExplorerPool[] = raw.map((p) => ({
    ...p,
    feeTier: num(p.feeTier),
    tick: p.tick === null || p.tick === undefined ? null : num(p.tick),
    token0Price: num(p.token0Price),
    tvlToken0: num(p.tvlToken0),
    tvlToken1: num(p.tvlToken1),
    tvlUSD: num(p.tvlUSD),
    token0: { ...p.token0, decimals: num(p.token0.decimals) },
    token1: { ...p.token1, decimals: num(p.token1.decimals) },
  }));
  const pools = list.filter(
    (p) => !p.isBlacklisted && p.tvlUSD >= TVL_FLOOR && p.tvlUSD <= TVL_CEILING && p.tick !== null && Number.isFinite(p.tick)
  );

  const settled = await mapWithConcurrency(pools, 6, async (p) => {
    const [fees, volume, ticks] = await Promise.all([
      getJson<Bucket[]>(`${base}/pools/chart/v3/${chain}/${p.id}/fees`).catch(() => [] as Bucket[]),
      getJson<Bucket[]>(`${base}/pools/chart/v3/${chain}/${p.id}/volume?period=1M`).catch(() => [] as Bucket[]),
      fetchTicks(base, chain, p.id).catch(() => null),
    ]);
    return compute(source, timeframe, startTimestamp, p, fees, volume, ticks);
  });

  const rows = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const fell = rows.filter((r) => r.tvlSource !== "liquidity").length;
  if (fell) console.warn(`[pools] ${source.key}: ${fell}/${rows.length} rows kept the API TVL (${reasons.join(", ")})`);
  return rows;
}

// Why a pool kept the API figure, tallied per run for the log line above
const reasons: string[] = [];
function noteReason(r: string) { if (!reasons.includes(r)) reasons.push(r); }

function compute(
  source: SourceConfig,
  timeframe: Timeframe,
  startTimestamp: number,
  p: ExplorerPool,
  fees: Bucket[],
  volume: Bucket[],
  tickData: { ticks: SubgraphTickLite[]; clipped: boolean } | null,
): ComputedPool {
  // Token USD prices from the pool's own composition: tvlUSD is the sum of
  // both balances at their USD prices, and token0Price ties the two prices
  // together, so both fall out of the pair of equations.
  const denom = p.tvlToken0 + p.tvlToken1 * p.token0Price;
  const price0 = denom > 0 ? p.tvlUSD / denom : 0;
  const price1 = price0 * p.token0Price;

  const pool: SubgraphPool = {
    id: p.id,
    feeTier: String(p.feeTier),
    totalValueLockedUSD: String(p.tvlUSD),
    tick: p.tick === null ? null : String(p.tick),
    liquidity: p.liquidity,
    token0: { id: p.token0.id, symbol: p.token0.symbol, decimals: String(p.token0.decimals), derivedNative: String(price0) },
    token1: { id: p.token1.id, symbol: p.token1.symbol, decimals: String(p.token1.decimals), derivedNative: String(price1) },
  };
  // derivedNative already holds USD, so the "native" price is 1
  const liqRaw = tickData && !tickData.clipped
    ? computePoolLiquidity(pool, tickData.ticks, 1)
    : null;
  if (!tickData) noteReason("ticks failed");
  else if (tickData.clipped) noteReason("ticks clipped");
  else if (!liqRaw) noteReason("walk returned null");
  const liq = liqRaw && liqRaw.tvlUsd <= p.tvlUSD * 1.5 ? liqRaw : null;
  if (liqRaw && !liq) noteReason(`reconstruction above 1.5x (e.g. ${Math.round(liqRaw.tvlUsd / p.tvlUSD)}x)`);
  const tvl = liq ? liq.tvlUsd : p.tvlUSD;
  const scale = liq && p.tvlUSD > 0 ? liq.tvlUsd / p.tvlUSD : 1;

  // The fee chart is the daily series; there is no daily TVL, so every day
  // carries the current figure and the rescale corrects its level.
  const volumeByDay = new Map<number, number>();
  for (const b of volume) {
    if (b.volumeUSD !== undefined) volumeByDay.set(dayOf(b.bucket), parseFloat(b.volumeUSD));
  }
  const series: SubgraphPoolDayData[] = fees
    .map((b) => ({ date: dayOf(b.bucket), feesUSD: b.feeUSD ?? "0", volumeUSD: "0", tvlUSD: String(p.tvlUSD) }))
    .filter((d) => d.date >= startTimestamp)
    .sort((a, b) => b.date - a.date);
  const dayDatas = usableDays(series);

  const avgDailyFees = computeAvgDailyFees(dayDatas);
  const apr = computeAPRFromSeries(dayDatas, scale);

  // Volume has its own, shorter series (30 days); average what the window has
  const usableDates = new Set(dayDatas.map((d) => d.date));
  const vols = [...volumeByDay.entries()]
    .filter(([date]) => usableDates.has(date))
    .map(([, v]) => v);
  const avgDailyVolume = vols.length ? vols.reduce((s, v) => s + v, 0) / vols.length : 0;

  return {
    id: p.id,
    poolName: poolLabel(p.token0.symbol, p.token1.symbol, p.feeTier),
    token0: { id: p.token0.id, symbol: p.token0.symbol },
    token1: { id: p.token1.id, symbol: p.token1.symbol },
    feeTier: p.feeTier,
    exchange: source.exchangeName,
    exchangeId: source.exchange,
    network: source.networkName,
    networkId: source.network,
    canSimulate: source.simulator,
    canTrack: source.track,
    tvl,
    tvlSource: liq ? "liquidity" : "api",
    apr,
    avgDailyFees,
    avgDailyVolume,
    priceVolatility: null,
    correlation: null,
    feeToTvlPct: computeFeeToTvl(avgDailyFees, tvl),
    volumeCV: coefficientOfVariation(vols),
    correlation7d: null,
    correlation30d: null,
    sourceNote: source.note,
  };
}
