import {
  NETWORKS, TOP_POOLS_COUNT, TVL_FLOOR, TICK_PAGE_SIZE, TICK_MAX_PAGES,
  TICK_CONCURRENCY,
} from "../constants";
import {
  SubgraphPool,
  SubgraphPoolDayData,
  SubgraphTokenDayData,
  PoolsQueryResponse,
  SubgraphTickLite,
  TopPoolsResult,
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

export async function fetchTopPools(subgraphUrl?: string): Promise<TopPoolsResult> {
  const batchSize = 100;
  const allPools: SubgraphPool[] = [];
  let skip = 0;
  let ethPriceUsd = 0;

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
        tick
        liquidity
        totalValueLockedUSD
        token0 { id symbol decimals derivedETH }
        token1 { id symbol decimals derivedETH }
      }
      bundle(id: "1") { ethPriceUSD }
    }`, subgraphUrl);

    ethPriceUsd = parseFloat(data.bundle?.ethPriceUSD ?? "0") || ethPriceUsd;
    if (data.pools.length === 0) break;
    allPools.push(...data.pools);
    skip += batchSize;
  }

  return { pools: allPools.slice(0, TOP_POOLS_COUNT), ethPriceUsd };
}

// Every initialized tick for a pool, ascending. Cursor-paginated on tickIdx
// rather than skip, which the gateway caps and degrades on.
export async function fetchPoolTicks(
  poolId: string,
  subgraphUrl?: string
): Promise<{ ticks: SubgraphTickLite[]; clipped: boolean }> {
  const ticks: SubgraphTickLite[] = [];
  let cursor = -887300;

  for (let page = 0; page < TICK_MAX_PAGES; page++) {
    const data = await querySubgraph<{ ticks: SubgraphTickLite[] }>(`{
      ticks(
        first: ${TICK_PAGE_SIZE}
        orderBy: tickIdx
        orderDirection: asc
        where: { pool: "${poolId}", tickIdx_gt: ${cursor}, liquidityNet_not: "0" }
      ) { tickIdx liquidityNet }
    }`, subgraphUrl);

    ticks.push(...data.ticks);
    if (data.ticks.length < TICK_PAGE_SIZE) return { ticks, clipped: false };
    cursor = parseInt(data.ticks[data.ticks.length - 1].tickIdx, 10);
  }
  // Ran out of pages: the walk would be missing liquidity, so the caller must
  // not treat the result as a complete picture.
  return { ticks, clipped: true };
}

export async function fetchAllPoolTicks(
  poolIds: string[],
  subgraphUrl?: string
): Promise<Map<string, { ticks: SubgraphTickLite[]; clipped: boolean }>> {
  const result = new Map<string, { ticks: SubgraphTickLite[]; clipped: boolean }>();

  for (let i = 0; i < poolIds.length; i += TICK_CONCURRENCY) {
    const batch = poolIds.slice(i, i + TICK_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchPoolTicks(id, subgraphUrl))
    );
    batch.forEach((id, idx) => {
      const r = settled[idx];
      // A pool whose ticks fail simply keeps the subgraph figure downstream
      if (r.status === "fulfilled") result.set(id, r.value);
    });
  }

  return result;
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
