import { Router, Request, Response } from "express";
import { VALID_TIMEFRAMES, Timeframe, NETWORKS, VALID_NETWORKS } from "../constants";
import { getCached, setCache } from "../services/cache";
import {
  fetchTopPools,
  fetchAllPoolDayDatas,
  fetchAllTokenDayDatas,
} from "../services/subgraph";
import {
  computeAvgDailyFees,
  computeAvgDailyVolume,
  computeAvgDailyTVL,
  computeAPR,
  computeVolatility,
  computeCorrelation,
  getVolatilityTokenId,
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

  // Step 1: Fetch top pools
  const pools = await fetchTopPools(subgraphUrl);

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

  // Step 5: Compute metrics for each pool
  return pools.map((pool) => {
    const dayDatas = poolDayDatasMap.get(pool.id) || [];
    const avgDailyFees = computeAvgDailyFees(dayDatas);
    const avgDailyVolume = computeAvgDailyVolume(dayDatas);
    const avgDailyTVL = computeAvgDailyTVL(dayDatas);
    const apr = computeAPR(avgDailyFees, avgDailyTVL);

    const volatilityTokenId = getVolatilityTokenId(pool.token0, pool.token1);
    const volatilityData = tokenDayDatasMap.get(volatilityTokenId) || [];
    const priceVolatility = computeVolatility(volatilityData);

    const token0Prices = tokenDayDatasMap.get(pool.token0.id) || [];
    const token1Prices = tokenDayDatasMap.get(pool.token1.id) || [];
    const correlation = computeCorrelation(token0Prices, token1Prices);

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
      tvl: parseFloat(pool.totalValueLockedUSD),
      apr,
      avgDailyFees,
      avgDailyVolume,
      priceVolatility,
      correlation,
    };
  });
}

router.get("/", async (req: Request, res: Response) => {
  const timeframeParam = parseInt(req.query.timeframe as string, 10);

  if (!VALID_TIMEFRAMES.includes(timeframeParam as Timeframe)) {
    res.status(400).json({ error: "timeframe must be 7, 30, or 90" });
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
