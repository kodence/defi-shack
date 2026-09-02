export interface Pool {
  id: string;
  poolName: string;
  token0: { id: string; symbol: string };
  token1: { id: string; symbol: string };
  feeTier: number;
  exchange: string;        // display name
  exchangeId: string;      // key, for URLs and lookups
  network: string;         // display name
  networkId: string;
  // What the row's source can support downstream. Simulation needs tick
  // liquidity and daily OHLC; tracking needs position feeGrowth.
  canSimulate: boolean;
  canTrack: boolean;
  tvl: number;
  // "liquidity" = rebuilt from ticks (trustworthy); "subgraph" = fell back to
  // the drifting totalValueLocked figure because ticks were unavailable;
  // "api" = the source's own figure, from a REST API rather than a subgraph
  tvlSource: "liquidity" | "subgraph" | "api";
  apr: number;
  avgDailyFees: number;
  avgDailyVolume: number;
  // Null where the source has no daily price series to derive it from
  priceVolatility: number | null;
  correlation: number | null;
  feeToTvlPct: number;
  volumeCV: number | null;
  correlation7d: number | null;
  correlation30d: number | null;
  // Caveat about the source, surfaced beside the row
  sourceNote?: string;
}

export interface SourceError {
  source: string;
  error: string;
}

export interface PoolsApiResponse {
  data: Pool[];
  meta: {
    timeframe: number;
    poolCount: number;
    fetchedAt: string;
    // Sources that failed this fetch; the rest of the table is still served
    errors?: SourceError[];
  };
}
