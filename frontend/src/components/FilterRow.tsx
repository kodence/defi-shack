"use client";

import { COLUMNS } from "@/utils/constants";

interface FilterRowProps {
  filters: Record<string, { min: string; max: string }>;
  onFilterChange: (key: string, bound: "min" | "max", value: string) => void;
}

export default function FilterRow({ filters, onFilterChange }: FilterRowProps) {
  return (
    <tr>
      {COLUMNS.map((col) => (
        <th key={col.key}>
          {col.filterable && filters[col.key] ? (
            <div className="is-flex is-flex-direction-row" style={{ gap: "4px" }}>
              <input
                className="input is-small filter-input"
                type="number"
                placeholder="Min"
                value={filters[col.key].min}
                onChange={(e) =>
                  onFilterChange(col.key, "min", e.target.value)
                }
              />
              <input
                className="input is-small filter-input"
                type="number"
                placeholder="Max"
                value={filters[col.key].max}
                onChange={(e) =>
                  onFilterChange(col.key, "max", e.target.value)
                }
              />
            </div>
          ) : null}
        </th>
      ))}
      <th></th>
    </tr>
  );
}
