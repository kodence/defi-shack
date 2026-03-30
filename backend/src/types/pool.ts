export interface ComputedPool {
  id: string;
  poolName: string;
  token0: { id: string; symbol: string };
  token1: { id: string; symbol: string };
  feeTier: number;
  exchange: string;
  network: string;
  tvl: number;
  apr: number;
  avgDailyFees: number;
  avgDailyVolume: number;
  priceVolatility: number;
  correlation: number;
}

export interface ApiResponse {
  data: ComputedPool[];
  meta: {
    timeframe: number;
    poolCount: number;
    fetchedAt: string;
  };
}
