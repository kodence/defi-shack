"use client";

import { useState, useMemo } from "react";
import { Pool } from "@/types/pool";
import { SortableColumn, COLUMNS } from "@/utils/constants";

type FilterValues = Record<string, { min: string; max: string }>;

interface UseFiltersReturn {
  filters: FilterValues;
  setFilter: (key: string, bound: "min" | "max", value: string) => void;
  applyFilters: (pools: Pool[]) => Pool[];
  clearFilters: () => void;
}

const DEFAULT_MINS: Record<string, string> = {
  apr: "1",
  tvl: "1000000",
  avgDailyVolume: "1000000",
  avgDailyFees: "1000",
};

function initFilters(): FilterValues {
  const filters: FilterValues = {};
  for (const col of COLUMNS) {
    if (col.filterable) {
      filters[col.key] = { min: DEFAULT_MINS[col.key] ?? "", max: "" };
    }
  }
  return filters;
}

export function useFilters(): UseFiltersReturn {
  const [filters, setFilters] = useState<FilterValues>(initFilters);

  const setFilter = (key: string, bound: "min" | "max", value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: { ...prev[key], [bound]: value },
    }));
  };

  const clearFilters = () => {
    setFilters(initFilters());
  };

  const applyFilters = useMemo(() => {
    return (pools: Pool[]) => {
      return pools.filter((pool) => {
        for (const [key, { min, max }] of Object.entries(filters)) {
          const value = pool[key as SortableColumn] as number;
          if (min !== "" && value < parseFloat(min)) return false;
          if (max !== "" && value > parseFloat(max)) return false;
        }
        return true;
      });
    };
  }, [filters]);

  return { filters, setFilter, applyFilters, clearFilters };
}
