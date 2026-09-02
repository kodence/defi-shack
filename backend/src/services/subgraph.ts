import {
  TOP_POOLS_COUNT, TVL_FLOOR, TICK_PAGE_SIZE, TICK_MAX_PAGES, TICK_CONCURRENCY,
  GATEWAY_RETRIES, SourceConfig,
} from "../constants";
import { bundleQuery, poolFeeField, poolsWhere, tokenFields } from "./dialect";
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

// Errors worth a retry: the gateway found no healthy indexer for this
// request, an indexer timed out, or the transport failed. A schema error is
// deterministic and is thrown straight back.
const RETRYABLE = /bad indexers|indexer|unavailable|timeout|timed out|fetch failed|ECONNRESET|\b(429|502|503|504)\b/i;

async function querySubgraphOnce<T>(query: string, url: string): Promise<T> {
  const res = await fetch(url, {
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

export async function querySubgraph<T>(query: string, url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await querySubgraphOnce<T>(query, url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= GATEWAY_RETRIES - 1 || !RETRYABLE.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
}

export async function fetchTopPools(source: SourceConfig): Promise<TopPoolsResult> {
  const d = source.dialect;
  const batchSize = 100;
  const allPools: SubgraphPool[] = [];
  let skip = 0;
  let nativePriceUsd = 0;
  const where = poolsWhere(d);

  while (allPools.length < TOP_POOLS_COUNT) {
    // The TVL floor is applied here rather than as a `where`: the pages come
    // back ordered by TVL, so the first pool under the floor ends the walk,
    // and the older graph-node builds behind some deployments reject a
    // filtered-and-ordered query outright.
    const data = await querySubgraph<PoolsQueryResponse>(`{
      pools(
        first: ${batchSize}
        skip: ${skip}
        orderBy: totalValueLockedUSD
        orderDirection: desc
        ${where}
      ) {
        id
        ${poolFeeField(d)}
        tick
        liquidity
        totalValueLockedUSD
        token0 { ${tokenFields(d)} }
        token1 { ${tokenFields(d)} }
      }
      ${bundleQuery(d)}
    }`, source.url);

    nativePriceUsd = parseFloat(data.bundle?.nativePriceUSD ?? "0") || nativePriceUsd;
    if (data.pools.length === 0) break;
    const above = data.pools.filter((p) => parseFloat(p.totalValueLockedUSD) >= TVL_FLOOR);
    allPools.push(...above);
    if (above.length < data.pools.length) break;
    skip += batchSize;
  }

  return { pools: allPools.slice(0, TOP_POOLS_COUNT), nativePriceUsd };
}

// Every initialized tick for a pool, ascending. Cursor-paginated on tickIdx
// rather than skip, which the gateway caps and degrades on.
export async function fetchPoolTicks(
  poolId: string,
  url: string
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
    }`, url);

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
  url: string,
  concurrency: number = TICK_CONCURRENCY
): Promise<Map<string, { ticks: SubgraphTickLite[]; clipped: boolean }>> {
  const result = new Map<string, { ticks: SubgraphTickLite[]; clipped: boolean }>();

  for (let i = 0; i < poolIds.length; i += concurrency) {
    const batch = poolIds.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchPoolTicks(id, url))
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
  url: string
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
  }`, url);
  return data.poolDayDatas;
}

export async function fetchTokenDayDatas(
  tokenId: string,
  startTimestamp: number,
  url: string
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
  }`, url);
  return data.tokenDayDatas;
}

// Batch fetch pool day datas for multiple pools in parallel. A pool whose
// request fails (after the gateway retries) is left out of the map rather
// than failing the source; the caller drops it, since a row with no day
// data would read as a pool earning nothing.
export async function fetchAllPoolDayDatas(
  poolIds: string[],
  startTimestamp: number,
  url: string,
  concurrency = 10
): Promise<Map<string, SubgraphPoolDayData[]>> {
  const result = new Map<string, SubgraphPoolDayData[]>();

  for (let i = 0; i < poolIds.length; i += concurrency) {
    const batch = poolIds.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchPoolDayDatas(id, startTimestamp, url))
    );
    batch.forEach((id, idx) => {
      const r = settled[idx];
      if (r.status === "fulfilled") result.set(id, r.value);
    });
  }

  return result;
}

// Batch fetch token day datas for multiple tokens in parallel. A token whose
// request fails is left out; the metrics that need it fall back to their
// no-data values for the pools involved.
export async function fetchAllTokenDayDatas(
  tokenIds: string[],
  startTimestamp: number,
  url: string,
  concurrency = 10
): Promise<Map<string, SubgraphTokenDayData[]>> {
  const result = new Map<string, SubgraphTokenDayData[]>();

  for (let i = 0; i < tokenIds.length; i += concurrency) {
    const batch = tokenIds.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchTokenDayDatas(id, startTimestamp, url))
    );
    batch.forEach((id, idx) => {
      const r = settled[idx];
      if (r.status === "fulfilled") result.set(id, r.value);
    });
  }

  return result;
}
