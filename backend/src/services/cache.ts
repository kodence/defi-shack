import { CACHE_TTL_MS } from "../constants";
import { ComputedPool } from "../types/pool";

interface CacheEntry {
  data: ComputedPool[];
  fetchedAt: Date;
  errors?: { source: string; error: string }[];
}

const cache = new Map<string, CacheEntry>();

function cacheKey(timeframe: number, networks: string[], exchanges: string[]): string {
  return `${[...networks].sort().join(",")}|${[...exchanges].sort().join(",")}_${timeframe}`;
}

export function getCached(timeframe: number, networks: string[], exchanges: string[]): CacheEntry | null {
  const key = cacheKey(timeframe, networks, exchanges);
  const entry = cache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.fetchedAt.getTime();
  if (age > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCache(
  timeframe: number, networks: string[], exchanges: string[],
  data: ComputedPool[], errors?: { source: string; error: string }[],
): void {
  const key = cacheKey(timeframe, networks, exchanges);
  cache.set(key, { data, fetchedAt: new Date(), errors: errors?.length ? errors : undefined });
}
