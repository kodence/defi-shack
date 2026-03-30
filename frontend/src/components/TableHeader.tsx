"use client";

import { COLUMNS, SortableColumn } from "@/utils/constants";

interface TableHeaderProps {
  sortColumn: SortableColumn;
  sortDirection: "asc" | "desc";
  onSort: (column: SortableColumn) => void;
}

export default function TableHeader({
  sortColumn,
  sortDirection,
  onSort,
}: TableHeaderProps) {
  return (
    <tr>
      {COLUMNS.map((col) => (
        <th
          key={col.key}
          className="sortable"
          onClick={() => onSort(col.key)}
        >
          {col.label}{" "}
          {sortColumn === col.key ? (sortDirection === "asc" ? "\u25B2" : "\u25BC") : ""}
        </th>
      ))}
      <th></th>
    </tr>
  );
}
