import { NETWORKS, TOP_POOLS_COUNT, TVL_FLOOR } from "../constants";
import {
  SubgraphPool,
  SubgraphPoolDayData,
  SubgraphTokenDayData,
  PoolsQueryResponse,
  PoolDayDatasQueryResponse,
  TokenDayDatasQueryResponse,
} from "../types/subgraph";

export async function querySubgraph<T>(query: string, subgraphUrl: string = NETWORKS.ethereum.subgraphUrl): Promise<T> {
  const res = await fetch(subgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Subgraph query failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data?: T; errors?: unknown[] };
  if (json.errors) {
    throw new Error(`Subgraph error: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

export async function fetchTopPools(subgraphUrl?: string): Promise<SubgraphPool[]> {
  const batchSize = 100;
  const allPools: SubgraphPool[] = [];
  let skip = 0;

  while (allPools.length < TOP_POOLS_COUNT) {
    const data = await querySubgraph<PoolsQueryResponse>(`{
      pools(
        first: ${batchSize}
        skip: ${skip}
        orderBy: totalValueLockedUSD
        orderDirection: desc
        where: { totalValueLockedUSD_gte: "${TVL_FLOOR}" }
      ) {
        id
        feeTier
        totalValueLockedUSD
        token0 { id symbol }
        token1 { id symbol }
      }
    }`, subgraphUrl);

    if (data.pools.length === 0) break;
    allPools.push(...data.pools);
    skip += batchSize;
  }

  return allPools.slice(0, TOP_POOLS_COUNT);
}

export async function fetchPoolDayDatas(
  poolId: string,
  startTimestamp: number,
  subgraphUrl?: string
): Promise<SubgraphPoolDayData[]> {
  const data = await querySubgraph<PoolDayDatasQueryResponse>(`{
    poolDayDatas(
      first: 1000
      where: { pool: "${poolId}", date_gte: ${startTimestamp} }
      orderBy: date
      orderDirection: desc
    ) {
      date
      feesUSD
      volumeUSD
      tvlUSD
    }
  }`, subgraphUrl);
  return data.poolDayDatas;
}

export async function fetchTokenDayDatas(
  tokenId: string,
  startTimestamp: number,
  subgraphUrl?: string
): Promise<SubgraphTokenDayData[]> {
  const data = await querySubgraph<TokenDayDatasQueryResponse>(`{
    tokenDayDatas(
      first: 1000
      where: { token: "${tokenId}", date_gte: ${startTimestamp} }
      orderBy: date
      orderDirection: desc
    ) {
      date
      priceUSD
    }
  }`, subgraphUrl);
  return data.tokenDayDatas;
}

// Batch fetch pool day datas for multiple pools in parallel with concurrency limit
export async function fetchAllPoolDayDatas(
  poolIds: string[],
  startTimestamp: number,
  subgraphUrl?: string
): Promise<Map<string, SubgraphPoolDayData[]>> {
  const result = new Map<string, SubgraphPoolDayData[]>();
  const concurrency = 10;

  for (let i = 0; i < poolIds.length; i += concurrency) {
    const batch = poolIds.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((id) => fetchPoolDayDatas(id, startTimestamp, subgraphUrl))
    );
    batch.forEach((id, idx) => result.set(id, results[idx]));
  }

  return result;
}

// Batch fetch token day datas for multiple tokens in parallel with concurrency limit
export async function fetchAllTokenDayDatas(
  tokenIds: string[],
  startTimestamp: number,
  subgraphUrl?: string
): Promise<Map<string, SubgraphTokenDayData[]>> {
  const result = new Map<string, SubgraphTokenDayData[]>();
  const concurrency = 10;

  for (let i = 0; i < tokenIds.length; i += concurrency) {
    const batch = tokenIds.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((id) => fetchTokenDayDatas(id, startTimestamp, subgraphUrl))
    );
    batch.forEach((id, idx) => result.set(id, results[idx]));
  }

  return result;
}
