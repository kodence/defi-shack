import { SourceConfig, Timeframe, TOP_POOLS_COUNT, TVL_FLOOR, TVL_CEILING } from "../../constants";
import { querySubgraph } from "../subgraph";
import { computePoolLiquidity } from "../poolLiquidity";
import {
  computeAvgDailyFees, computeAvgDailyVolume, computeAvgDailyTVL,
  computeAPRFromSeries, computeFeeToTvl, computeVolumeCV, usableDays,
} from "../metrics";
import { SubgraphPool, SubgraphPoolDayData, SubgraphTickLite } from "../../types/subgraph";
import { ComputedPool } from "../../types/pool";
import { mapWithConcurrency, poolLabel } from "./common";

// Messari's standard DEX schema, which is what remains on The Graph for
// SushiSwap V3. It carries what the daily metrics need -- volume, LP-side
// revenue (fees), TVL, the current tick and active liquidity, and ticks --
// but tokens have only a current price, so the price-series columns are
// blank. Its TVL ordering is polluted by junk pairs at fabricated prices;
// a swap-count floor filters those and the usual TVL ceiling catches the rest.

interface MToken { id: string; symbol: string; decimals: number; lastPriceUSD: string }
interface MPool {
  id: string;
  tick: string | null;
  activeLiquidity: string;
  totalValueLockedUSD: string;
  fees: { feePercentage: string; feeType: string }[];
  inputTokens: MToken[];
}
interface MSnapshot {
  day: number;                       // days since epoch
  totalValueLockedUSD: string;
  dailyVolumeUSD: string;
  dailySupplySideRevenueUSD: string;
}
interface MTick { index: string; liquidityNet: string }

const MIN_SWAPS = 1000;

async function fetchPools(url: string): Promise<MPool[]> {
  const out: MPool[] = [];
  let skip = 0;
  while (out.length < TOP_POOLS_COUNT) {
    const data = await querySubgraph<{ liquidityPools: MPool[] }>(`{
      liquidityPools(
        first: 100
        skip: ${skip}
        orderBy: totalValueLockedUSD
        orderDirection: desc
        where: { totalValueLockedUSD_gte: "${TVL_FLOOR}", cumulativeSwapCount_gte: ${MIN_SWAPS} }
      ) {
        id tick activeLiquidity totalValueLockedUSD
        fees { feePercentage feeType }
        inputTokens { id symbol decimals lastPriceUSD }
      }
    }`, url);
    out.push(...data.liquidityPools);
    if (data.liquidityPools.length < 100) break;
    skip += 100;
  }
  return out.slice(0, TOP_POOLS_COUNT);
}

// LP fee share as a V3-style tier (0.3% -> 3000)
function feeTierOf(p: MPool): number {
  const lp = p.fees.find((f) => f.feeType === "FIXED_LP_FEE") ?? p.fees.find((f) => f.feeType === "FIXED_TRADING_FEE");
  return lp ? Math.round(parseFloat(lp.feePercentage) * 10000) : 0;
}

export async function fetchMessariDiscovery(
  source: SourceConfig,
  timeframe: Timeframe,
  startTimestamp: number
): Promise<ComputedPool[]> {
  const url = source.url;
  const startDay = Math.floor(startTimestamp / 86400);

  const all = await fetchPools(url);
  const pools = all.filter(
    (p) => parseFloat(p.totalValueLockedUSD) <= TVL_CEILING && p.inputTokens.length === 2 && p.tick !== null
  );

  const settled = await mapWithConcurrency(pools, 10, async (p) => {
    const data = await querySubgraph<{ snaps: MSnapshot[]; ticks: MTick[] }>(`{
      snaps: liquidityPoolDailySnapshots(
        first: 1000
        where: { pool: "${p.id}", day_gte: ${startDay} }
        orderBy: day
        orderDirection: desc
      ) { day totalValueLockedUSD dailyVolumeUSD dailySupplySideRevenueUSD }
      ticks(
        first: 1000
        where: { pool: "${p.id}", liquidityNet_not: "0" }
        orderBy: index
        orderDirection: asc
      ) { index liquidityNet }
    }`, url);
    return compute(source, p, data.snaps, data.ticks);
  });

  return settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

function compute(source: SourceConfig, p: MPool, snaps: MSnapshot[], mticks: MTick[]): ComputedPool {
  const [t0, t1] = p.inputTokens;
  const feeTier = feeTierOf(p);

  // Messari prices tokens in USD directly, so they stand in for
  // derived-native with a native price of 1.
  const pool: SubgraphPool = {
    id: p.id,
    feeTier: String(feeTier),
    totalValueLockedUSD: p.totalValueLockedUSD,
    tick: p.tick,
    liquidity: p.activeLiquidity,
    token0: { id: t0.id, symbol: t0.symbol, decimals: String(t0.decimals), derivedNative: t0.lastPriceUSD },
    token1: { id: t1.id, symbol: t1.symbol, decimals: String(t1.decimals), derivedNative: t1.lastPriceUSD },
  };
  const ticks: SubgraphTickLite[] = mticks.map((t) => ({ tickIdx: t.index, liquidityNet: t.liquidityNet }));
  const clipped = mticks.length >= 1000;
  const liqRaw = !clipped ? computePoolLiquidity(pool, ticks, 1) : null;
  // Same guard as the subgraph path: above the source figure means bad prices
  const liq = liqRaw && liqRaw.tvlUsd <= parseFloat(p.totalValueLockedUSD) * 1.5 ? liqRaw : null;

  const series: SubgraphPoolDayData[] = snaps.map((s) => ({
    date: s.day * 86400,
    feesUSD: s.dailySupplySideRevenueUSD,
    volumeUSD: s.dailyVolumeUSD,
    tvlUSD: s.totalValueLockedUSD,
  }));
  const dayDatas = usableDays(series);

  const avgDailyFees = computeAvgDailyFees(dayDatas);
  const avgDailyVolume = computeAvgDailyVolume(dayDatas);
  const currentTvl = parseFloat(p.totalValueLockedUSD);
  const scale = liq && currentTvl > 0 ? liq.tvlUsd / currentTvl : 1;
  const avgDailyTVL = computeAvgDailyTVL(dayDatas) * scale;
  const apr = computeAPRFromSeries(dayDatas, scale);

  return {
    id: p.id,
    poolName: poolLabel(t0.symbol, t1.symbol, feeTier),
    token0: { id: t0.id, symbol: t0.symbol },
    token1: { id: t1.id, symbol: t1.symbol },
    feeTier,
    exchange: source.exchangeName,
    exchangeId: source.exchange,
    network: source.networkName,
    networkId: source.network,
    canSimulate: source.simulator,
    canTrack: source.track,
    tvl: avgDailyTVL,
    tvlSource: liq ? "liquidity" : "subgraph",
    apr,
    avgDailyFees,
    avgDailyVolume,
    priceVolatility: null,
    correlation: null,
    feeToTvlPct: computeFeeToTvl(avgDailyFees, avgDailyTVL),
    volumeCV: computeVolumeCV(dayDatas),
    correlation7d: null,
    correlation30d: null,
    sourceNote: source.note,
  };
}
