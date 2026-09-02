"use client";

import { useState, useEffect, useCallback } from "react";
import { Pool, PoolsApiResponse, SourceError } from "@/types/pool";
import { API_BASE_URL } from "@/utils/constants";

interface UsePoolDataReturn {
  pools: Pool[];
  loading: boolean;
  error: string | null;
  // Sources that failed while the rest of the table loaded
  sourceErrors: SourceError[];
  fetchedAt: string | null;
  refetch: () => void;
}

export function usePoolData(timeframe: number, networks: string[], exchanges: string[]): UsePoolDataReturn {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceErrors, setSourceErrors] = useState<SourceError[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const networksKey = networks.join(",");
  const exchangesKey = exchanges.join(",");

  const fetchPools = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/pools?timeframe=${timeframe}&networks=${networksKey}&exchanges=${exchangesKey}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `API error: ${res.status}`);
      }
      const json: PoolsApiResponse = await res.json();
      setPools(json.data);
      setSourceErrors(json.meta.errors ?? []);
      setFetchedAt(json.meta.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch pools");
    } finally {
      setLoading(false);
    }
  }, [timeframe, networksKey, exchangesKey]);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  return { pools, loading, error, sourceErrors, fetchedAt, refetch: fetchPools };
}
