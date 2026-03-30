"use client";

import { useState, useMemo } from "react";
import { Pool } from "@/types/pool";
import { SortableColumn } from "@/utils/constants";

type SortDirection = "asc" | "desc";

interface UseSortingReturn {
  sortColumn: SortableColumn;
  sortDirection: SortDirection;
  toggleSort: (column: SortableColumn) => void;
  applySorting: (pools: Pool[]) => Pool[];
}

export function useSorting(): UseSortingReturn {
  const [sortColumn, setSortColumn] = useState<SortableColumn>("tvl");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const toggleSort = (column: SortableColumn) => {
    if (column === sortColumn) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const applySorting = useMemo(() => {
    return (pools: Pool[]) => {
      return [...pools].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        if (typeof aVal === "string" && typeof bVal === "string") {
          return sortDirection === "asc"
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }

        const aNum = aVal as number;
        const bNum = bVal as number;
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      });
    };
  }, [sortColumn, sortDirection]);

  return { sortColumn, sortDirection, toggleSort, applySorting };
}
