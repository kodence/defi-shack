// Raw response types from The Graph Uniswap V3 Subgraph

export interface SubgraphToken {
  id: string;
  symbol: string;
}

export interface SubgraphPool {
  id: string;
  feeTier: string;
  totalValueLockedUSD: string;
  token0: SubgraphToken;
  token1: SubgraphToken;
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

export interface PoolsQueryResponse {
  pools: SubgraphPool[];
}

export interface PoolDayDatasQueryResponse {
  poolDayDatas: SubgraphPoolDayData[];
}

export interface TokenDayDatasQueryResponse {
  tokenDayDatas: SubgraphTokenDayData[];
}
