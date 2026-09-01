import { Router, Request, Response } from "express";
import {
  VALID_TIMEFRAMES, Timeframe, NETWORKS, VALID_NETWORKS, TVL_CEILING,
  REFERENCE_POSITION_USD,
} from "../constants";
import { getCached, setCache } from "../services/cache";
import {
  fetchTopPools,
  fetchAllPoolDayDatas,
  fetchAllTokenDayDatas,
  fetchAllPoolTicks,
} from "../services/subgraph";
import { computePoolLiquidity } from "../services/poolLiquidity";
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
} from "../services/metrics";
import { ComputedPool, ApiResponse } from "../types/pool";

const router = Router();

function formatFeeTier(feeTier: string): string {
  const bps = parseInt(feeTier, 10);
  return `${bps / 10000}%`;
}

function parseNetworks(param: unknown): string[] | null {
  if (!param || typeof param !== "string") return ["ethereum"];
  const networks = param.split(",").map((n) => n.trim().toLowerCase());
  for (const n of networks) {
    if (!VALID_NETWORKS.includes(n)) return null;
  }
  return networks;
}

async function fetchPoolsForNetwork(
  networkKey: string,
  timeframe: Timeframe,
  startTimestamp: number
): Promise<ComputedPool[]> {
  const config = NETWORKS[networkKey];
  const subgraphUrl = config.subgraphUrl;

  // Step 1: Fetch top pools, discarding ones whose reported TVL is not credible
  const { pools: allPools, ethPriceUsd } = await fetchTopPools(subgraphUrl);
  const pools = allPools.filter(
    (p) => parseFloat(p.totalValueLockedUSD) <= TVL_CEILING
  );

  // Step 2: Fetch pool day datas for all pools
  const poolIds = pools.map((p) => p.id);
  const poolDayDatasMap = await fetchAllPoolDayDatas(poolIds, startTimestamp, subgraphUrl);

  // Step 3: Collect unique token IDs needed for volatility + correlation
  const tokenIds = new Set<string>();
  for (const pool of pools) {
    tokenIds.add(pool.token0.id);
    tokenIds.add(pool.token1.id);
  }

  // Step 4: Fetch token day datas
  const tokenDayDatasMap = await fetchAllTokenDayDatas(
    [...tokenIds],
    startTimestamp,
    subgraphUrl
  );

  // Step 5: Rebuild real TVL from tick liquidity. The subgraph's own TVL
  // fields drift 2-11x above what positions actually hold, which understates
  // every APR by the same factor.
  const tickMap = await fetchAllPoolTicks(poolIds, subgraphUrl);

  // Step 6: Compute metrics for each pool
  return pools.map((pool) => {
    const dayDatas = usableDays(poolDayDatasMap.get(pool.id) || []);
    const avgDailyFees = computeAvgDailyFees(dayDatas);
    const avgDailyVolume = computeAvgDailyVolume(dayDatas);
    const subgraphAvgTVL = computeAvgDailyTVL(dayDatas);

    // Only current liquidity can be reconstructed, but the daily TVL series is
    // wrong by a roughly constant factor, so rescaling it to the reconstructed
    // level keeps the day-to-day shape while fixing the level.
    const tickData = tickMap.get(pool.id);
    const liq = tickData && !tickData.clipped
      ? computePoolLiquidity(pool, tickData.ticks, ethPriceUsd)
      : null;
    const subgraphCurrentTVL = parseFloat(pool.totalValueLockedUSD);
    const scale = liq && subgraphCurrentTVL > 0
      ? liq.tvlUsd / subgraphCurrentTVL
      : 1;

    const avgDailyTVL = subgraphAvgTVL * scale;
    const apr = computeAPRFromSeries(dayDatas, scale);

    // Share of liquidity sitting within the active band around spot. Fees are
    // earned only by that slice, so it is the denominator an in-range LP sees.
    const activeShare = liq && liq.tvlUsd > 0 ? liq.activeTvlUsd / liq.tvlUsd : null;
    const activeTvl = activeShare !== null ? avgDailyTVL * activeShare : null;
    // What a REFERENCE_POSITION_USD deposit sitting in range would earn: it
    // competes with the in-range liquidity and with itself.
    const activeApr = activeTvl !== null
      ? (avgDailyFees / (activeTvl + REFERENCE_POSITION_USD)) * 365 * 100
      : null;

    // The same band measured on today's liquidity rather than averaged over the
    // window: what a deposit would actually compete with right now, and the
    // basis Metrix Finance quotes. Its denominator does not move with the
    // timeframe, so only the fee numerator changes between windows.
    const liveActiveTvl = liq ? liq.activeTvlUsd : null;
    const liveActiveApr = liveActiveTvl !== null
      ? (avgDailyFees / (liveActiveTvl + REFERENCE_POSITION_USD)) * 365 * 100
      : null;

    const volatilityTokenId = getVolatilityTokenId(pool.token0, pool.token1);
    const volatilityData = tokenDayDatasMap.get(volatilityTokenId) || [];
    const priceVolatility = computeVolatility(volatilityData);

    const token0Prices = tokenDayDatasMap.get(pool.token0.id) || [];
    const token1Prices = tokenDayDatasMap.get(pool.token1.id) || [];
    const correlation = computeCorrelation(token0Prices, token1Prices);
    const correlation7d = computeCorrelationWindow(token0Prices, token1Prices, 7);
    const correlation30d = computeCorrelationWindow(token0Prices, token1Prices, Math.min(30, timeframe));

    const feeTierStr = formatFeeTier(pool.feeTier);

    return {
      id: pool.id,
      poolName: `${pool.token0.symbol} / ${pool.token1.symbol} (${feeTierStr})`,
      token0: { id: pool.token0.id, symbol: pool.token0.symbol },
      token1: { id: pool.token1.id, symbol: pool.token1.symbol },
      feeTier: parseInt(pool.feeTier, 10),
      exchange: config.exchange,
      network: config.name,
      networkId: networkKey,
      // Averaged over the timeframe, matching the APR denominator. Reporting
      // current TVL here instead leaves the row unable to reconcile.
      tvl: avgDailyTVL,
      tvlSource: liq ? "liquidity" : "subgraph",
      apr,
      activeTvl,
      activeApr,
      liveActiveTvl,
      liveActiveApr,
      avgDailyFees,
      avgDailyVolume,
      priceVolatility,
      correlation,
      feeToTvlPct: computeFeeToTvl(avgDailyFees, avgDailyTVL),
      volumeCV: computeVolumeCV(dayDatas),
      correlation7d,
      correlation30d,
    };
  });
}

router.get("/", async (req: Request, res: Response) => {
  const timeframeParam = parseInt(req.query.timeframe as string, 10);

  if (!VALID_TIMEFRAMES.includes(timeframeParam as Timeframe)) {
    res.status(400).json({
      error: `timeframe must be one of: ${VALID_TIMEFRAMES.join(", ")}`,
    });
    return;
  }

  const timeframe = timeframeParam as Timeframe;

  const networks = parseNetworks(req.query.networks);
  if (!networks) {
    res.status(400).json({
      error: `networks must be comma-separated list of: ${VALID_NETWORKS.join(", ")}`,
    });
    return;
  }

  // Check cache
  const cached = getCached(timeframe, networks);
  if (cached) {
    const response: ApiResponse = {
      data: cached.data,
      meta: {
        timeframe,
        poolCount: cached.data.length,
        fetchedAt: cached.fetchedAt.toISOString(),
      },
    };
    res.json(response);
    return;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const startTimestamp = now - timeframe * 24 * 60 * 60;

    // Fetch pools from all selected networks in parallel
    const networkResults = await Promise.all(
      networks.map((n) => fetchPoolsForNetwork(n, timeframe, startTimestamp))
    );

    const computedPools: ComputedPool[] = networkResults.flat();

    // Cache the result
    setCache(timeframe, networks, computedPools);

    const response: ApiResponse = {
      data: computedPools,
      meta: {
        timeframe,
        poolCount: computedPools.length,
        fetchedAt: new Date().toISOString(),
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Failed to fetch pool data:", error);
    res.status(500).json({ error: "Failed to fetch pool data" });
  }
});

export default router;
