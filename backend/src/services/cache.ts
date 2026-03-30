import { CACHE_TTL_MS } from "../constants";
import { ComputedPool } from "../types/pool";

interface CacheEntry {
  data: ComputedPool[];
  fetchedAt: Date;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(timeframe: number, networks: string[]): string {
  return `${[...networks].sort().join(",")}_${timeframe}`;
}

export function getCached(timeframe: number, networks: string[]): CacheEntry | null {
  const key = cacheKey(timeframe, networks);
  const entry = cache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.fetchedAt.getTime();
  if (age > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCache(timeframe: number, networks: string[], data: ComputedPool[]): void {
  const key = cacheKey(timeframe, networks);
  cache.set(key, { data, fetchedAt: new Date() });
}
