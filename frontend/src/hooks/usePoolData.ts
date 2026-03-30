"use client";

import { useState, useEffect, useCallback } from "react";
import { Pool, PoolsApiResponse } from "@/types/pool";
import { API_BASE_URL } from "@/utils/constants";

interface UsePoolDataReturn {
  pools: Pool[];
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
  refetch: () => void;
}

export function usePoolData(timeframe: number, networks: string[]): UsePoolDataReturn {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const networksKey = networks.join(",");

  const fetchPools = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/pools?timeframe=${timeframe}&networks=${networksKey}`
      );
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const json: PoolsApiResponse = await res.json();
      setPools(json.data);
      setFetchedAt(json.meta.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch pools");
    } finally {
      setLoading(false);
    }
  }, [timeframe, networksKey]);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  return { pools, loading, error, fetchedAt, refetch: fetchPools };
}
