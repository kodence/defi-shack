export interface Pool {
  id: string;
  poolName: string;
  token0: { id: string; symbol: string };
  token1: { id: string; symbol: string };
  feeTier: number;
  exchange: string;
  network: string;
  networkId: string;
  tvl: number;
  // "liquidity" = rebuilt from ticks (trustworthy); "subgraph" = fell back to
  // the drifting totalValueLocked figure because ticks were unavailable
  tvlSource: "liquidity" | "subgraph";
  apr: number;
  avgDailyFees: number;
  avgDailyVolume: number;
  priceVolatility: number;
  correlation: number;
  feeToTvlPct: number;
  volumeCV: number;
  correlation7d: number;
  correlation30d: number;
}

export interface PoolsApiResponse {
  data: Pool[];
  meta: {
    timeframe: number;
    poolCount: number;
    fetchedAt: string;
  };
}
