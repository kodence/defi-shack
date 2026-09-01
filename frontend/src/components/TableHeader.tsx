"use client";

import { useState } from "react";
import { ColumnDef, SortableColumn } from "@/utils/constants";
import ColumnFilterDropdown from "./ColumnFilterDropdown";

interface TableHeaderProps {
  columns: ColumnDef[];
  sortColumn: SortableColumn;
  sortDirection: "asc" | "desc";
  onSort: (column: SortableColumn) => void;
  filters: Record<string, { min: string; max: string }>;
  onFilterChange: (key: string, bound: "min" | "max", value: string) => void;
}

export default function TableHeader({
  columns,
  sortColumn,
  sortDirection,
  onSort,
  filters,
  onFilterChange,
}: TableHeaderProps) {
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  return (
    <tr>
      {columns.map((col) => {
        const filter = filters[col.key];
        const hasActiveFilter =
          col.filterable && filter && (filter.min !== "" || filter.max !== "");

        return (
          <th key={col.key} className="sortable" style={{ position: "relative" }}>
            <span onClick={() => onSort(col.key)} style={{ cursor: "pointer" }}>
              {col.label}{" "}
              {sortColumn === col.key
                ? sortDirection === "asc"
                  ? "\u25B2"
                  : "\u25BC"
                : ""}
            </span>
            {col.filterable && filter && (
              <span
                className={`filter-icon${hasActiveFilter ? " filter-active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenFilter(openFilter === col.key ? null : col.key);
                }}
                title="Filter"
              >
                &#9698;
              </span>
            )}
            {openFilter === col.key && filter && (
              <ColumnFilterDropdown
                columnKey={col.key}
                min={filter.min}
                max={filter.max}
                onFilterChange={onFilterChange}
                onClose={() => setOpenFilter(null)}
              />
            )}
          </th>
        );
      })}
      <th aria-label="Actions" />
    </tr>
  );
}
