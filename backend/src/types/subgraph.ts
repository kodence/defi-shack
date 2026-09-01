// Raw response types from The Graph Uniswap V3 Subgraph

export interface SubgraphToken {
  id: string;
  symbol: string;
  decimals: string;
  derivedETH: string;
}

export interface SubgraphPool {
  id: string;
  feeTier: string;
  totalValueLockedUSD: string;
  // Needed to reconstruct what LP positions actually hold: the walk over
  // liquidityNet is anchored on the active liquidity at the current tick.
  tick: string | null;
  liquidity: string;
  token0: SubgraphToken;
  token1: SubgraphToken;
}

export interface SubgraphTickLite {
  tickIdx: string;
  liquidityNet: string;
}

export interface TopPoolsResult {
  pools: SubgraphPool[];
  ethPriceUsd: number;
}

export interface SubgraphPoolDayData {
  date: number;
  feesUSD: string;
  volumeUSD: string;
  tvlUSD: string;
}

export interface SubgraphTokenDayData {
  date: number;
  priceUSD: string;
}

// ── Simulator (live pool snapshot) ───────────────────────────────────────────

export interface SubgraphTokenFull {
  id: string;
  symbol: string;
  decimals: string;
  derivedETH: string;
}

export interface SubgraphPoolFull {
  id: string;
  feeTier: string;
  tick: string | null;
  liquidity: string;
  sqrtPrice: string;
  totalValueLockedUSD: string;
  token0: SubgraphTokenFull;
  token1: SubgraphTokenFull;
}

export interface SubgraphTick {
  tickIdx: string;
  liquidityNet: string;
}

export interface SubgraphPoolDayDataFull extends SubgraphPoolDayData {
  open: string;
  high: string;
  low: string;
  close: string;
  token0Price: string;
}

export interface PoolMetaQueryResponse {
  pool: SubgraphPoolFull | null;
  bundle: { ethPriceUSD: string } | null;
}

export interface PoolSnapshotQueryResponse {
  pool: { tick: string | null; liquidity: string } | null;
  ticks: SubgraphTick[];
  poolDayDatas: SubgraphPoolDayDataFull[];
  t0: SubgraphTokenDayData[];
  t1: SubgraphTokenDayData[];
}

export interface TicksPageQueryResponse {
  ticks: SubgraphTick[];
}

export interface PoolsQueryResponse {
  pools: SubgraphPool[];
  bundle: { ethPriceUSD: string } | null;
}

export interface PoolDayDatasQueryResponse {
  poolDayDatas: SubgraphPoolDayData[];
}

export interface TokenDayDatasQueryResponse {
  tokenDayDatas: SubgraphTokenDayData[];
}
