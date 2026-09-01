"use client";

import { useState, useMemo } from "react";
import { Pool } from "@/types/pool";
import { SortableColumn, COLUMNS, FATE_FILTERS } from "@/utils/constants";

type FilterValues = Record<string, { min: string; max: string }>;

interface UseFiltersReturn {
  filters: FilterValues;
  setFilter: (key: string, bound: "min" | "max", value: string) => void;
  applyFilters: (pools: Pool[]) => Pool[];
  clearFilters: () => void;
  applyFatePreset: () => void;
  fateActive: boolean;
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

  // One-click FATE framework filter set (APR band, TVL floor, volatility cap,
  // correlation floor); other filters are left untouched.
  const applyFatePreset = () => {
    setFilters((prev) => {
      const next = { ...prev };
      for (const [key, bounds] of Object.entries(FATE_FILTERS)) {
        next[key] = { ...bounds };
      }
      return next;
    });
  };

  const fateActive = Object.entries(FATE_FILTERS).every(
    ([key, bounds]) =>
      filters[key]?.min === bounds.min && filters[key]?.max === bounds.max
  );

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

  return { filters, setFilter, applyFilters, clearFilters, applyFatePreset, fateActive };
}
