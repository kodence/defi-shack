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

        // Columns that can be null (no tick data) always sort to the bottom
        const aNum = aVal as number | null;
        const bNum = bVal as number | null;
        if (aNum === null && bNum === null) return 0;
        if (aNum === null) return 1;
        if (bNum === null) return -1;
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      });
    };
  }, [sortColumn, sortDirection]);

  return { sortColumn, sortDirection, toggleSort, applySorting };
}
