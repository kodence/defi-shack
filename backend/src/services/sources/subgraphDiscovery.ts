import { SourceConfig, Timeframe, TVL_CEILING } from "../../constants";
import {
  fetchTopPools,
  fetchAllPoolDayDatas,
  fetchAllTokenDayDatas,
  fetchAllPoolTicks,
} from "../subgraph";
import { computePoolLiquidity } from "../poolLiquidity";
import {
  computeAvgDailyFees,
  computeAvgDailyVolume,
  computeAvgDailyTVL,
  computeAPRFromSeries,
  computeVolatility,
  computeCorrelation,
  computeFeeToTvl,
  computeVolumeCV,
  computeCorrelationWindow,
  getVolatilityTokenId,
  usableDays,
} from "../metrics";
import { SubgraphTokenDayData } from "../../types/subgraph";
import { ComputedPool } from "../../types/pool";
import { poolLabel } from "./common";

// A reconstruction may exceed the subgraph figure slightly through rounding
// and uncollected fees, never by multiples.
const RECONSTRUCTION_MAX_RATIO = 1.5;

// Discovery over any V3-schema subgraph. The dialect layer has already
// aliased the fork's field names, so the same code serves Uniswap V3 and V4,
// PancakeSwap, QuickSwap and HyperSwap.

// Newest USD price in a date-descending token series, if it has one
function newestUsd(days: SubgraphTokenDayData[] | undefined): number | undefined {
  if (!days?.length) return undefined;
  const v = parseFloat(days[0].priceUSD);
  return v > 0 ? v : undefined;
}

export async function fetchSubgraphDiscovery(
  source: SourceConfig,
  timeframe: Timeframe,
  startTimestamp: number
): Promise<ComputedPool[]> {
  const url = source.url;

  // Step 1: Fetch top pools, discarding ones whose reported TVL is not credible
  const { pools: allPools, nativePriceUsd } = await fetchTopPools(source);
  const pools = allPools.filter(
    (p) => parseFloat(p.totalValueLockedUSD) <= TVL_CEILING
  );

  // Step 2: Fetch pool day datas for all pools
  const poolIds = pools.map((p) => p.id);
  const poolDayDatasMap = await fetchAllPoolDayDatas(poolIds, startTimestamp, url, source.concurrency);
  const missing = poolIds.filter((id) => !poolDayDatasMap.has(id));
  if (missing.length) console.warn(`[pools] ${source.key}: day data failed for ${missing.length}/${poolIds.length} pools; dropped`);

  // Step 3: Collect unique token IDs needed for volatility + correlation
  const tokenIds = new Set<string>();
  for (const pool of pools) {
    tokenIds.add(pool.token0.id);
    tokenIds.add(pool.token1.id);
  }

  // Step 4: Fetch token day datas
  const tokenDayDatasMap = await fetchAllTokenDayDatas([...tokenIds], startTimestamp, url, source.concurrency);

  // Step 5: Rebuild real TVL from tick liquidity. The subgraph's own TVL
  // fields drift 2-11x above what positions actually hold, which understates
  // every APR by the same factor.
  const tickMap = await fetchAllPoolTicks(poolIds, url, Math.min(source.concurrency, 12));

  // Step 6: Compute metrics for each pool
  let rejected = 0;
  const rows = pools.filter((pool) => poolDayDatasMap.has(pool.id)).map((pool): ComputedPool => {
    const dayDatas = usableDays(poolDayDatasMap.get(pool.id) || []);
    const avgDailyFees = computeAvgDailyFees(dayDatas);
    const avgDailyVolume = computeAvgDailyVolume(dayDatas);
    const subgraphAvgTVL = computeAvgDailyTVL(dayDatas);

    // Only current liquidity can be reconstructed, but the daily TVL series is
    // wrong by a roughly constant factor, so rescaling it to the reconstructed
    // level keeps the day-to-day shape while fixing the level. Token prices
    // come from derived-native x native price, falling back to the newest
    // tokenDayData where a deployment's bundle is broken (V4 Polygon reports
    // its native price as 0).
    const tickData = tickMap.get(pool.id);
    const liqRaw = tickData && !tickData.clipped
      ? computePoolLiquidity(pool, tickData.ticks, nativePriceUsd, {
          token0Usd: newestUsd(tokenDayDatasMap.get(pool.token0.id)),
          token1Usd: newestUsd(tokenDayDatasMap.get(pool.token1.id)),
        })
      : null;
    const subgraphCurrentTVL = parseFloat(pool.totalValueLockedUSD);
    // The subgraph figure is the contract's whole balance, so it over-counts;
    // a reconstruction above it means a bad token price went in (one Polygon
    // stable pair came out at $3.4B), not a better answer. Fall back.
    const liq = liqRaw && liqRaw.tvlUsd <= subgraphCurrentTVL * RECONSTRUCTION_MAX_RATIO ? liqRaw : null;
    if (liqRaw && !liq) rejected++;
    const scale = liq && subgraphCurrentTVL > 0
      ? liq.tvlUsd / subgraphCurrentTVL
      : 1;

    const avgDailyTVL = subgraphAvgTVL * scale;
    const apr = computeAPRFromSeries(dayDatas, scale);

    const volatilityTokenId = getVolatilityTokenId(pool.token0, pool.token1);
    const volatilityData = tokenDayDatasMap.get(volatilityTokenId) || [];
    const priceVolatility = computeVolatility(volatilityData);

    const token0Prices = tokenDayDatasMap.get(pool.token0.id) || [];
    const token1Prices = tokenDayDatasMap.get(pool.token1.id) || [];
    const correlation = computeCorrelation(token0Prices, token1Prices);
    const correlation7d = computeCorrelationWindow(token0Prices, token1Prices, 7);
    const correlation30d = computeCorrelationWindow(token0Prices, token1Prices, Math.min(30, timeframe));

    const feeTier = parseInt(pool.feeTier, 10);

    return {
      id: pool.id,
      poolName: poolLabel(pool.token0.symbol, pool.token1.symbol, feeTier),
      token0: { id: pool.token0.id, symbol: pool.token0.symbol },
      token1: { id: pool.token1.id, symbol: pool.token1.symbol },
      feeTier,
      exchange: source.exchangeName,
      exchangeId: source.exchange,
      network: source.networkName,
      networkId: source.network,
      canSimulate: source.simulator,
      canTrack: source.track,
      // Averaged over the timeframe, matching the APR denominator. Reporting
      // current TVL here instead leaves the row unable to reconcile.
      tvl: avgDailyTVL,
      tvlSource: liq ? "liquidity" : "subgraph",
      apr,
      avgDailyFees,
      avgDailyVolume,
      priceVolatility,
      correlation,
      feeToTvlPct: computeFeeToTvl(avgDailyFees, avgDailyTVL),
      volumeCV: computeVolumeCV(dayDatas),
      correlation7d,
      correlation30d,
      sourceNote: source.note,
    };
  });
  const fellBack = rows.filter((r) => r.tvlSource === "subgraph").length;
  if (fellBack) console.warn(`[pools] ${source.key}: ${fellBack}/${rows.length} rows kept the subgraph TVL (${rejected} reconstructions rejected as implausible)`);
  return rows;
}
