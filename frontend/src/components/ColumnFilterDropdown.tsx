"use client";

import { useEffect, useRef } from "react";

interface ColumnFilterDropdownProps {
  columnKey: string;
  min: string;
  max: string;
  onFilterChange: (key: string, bound: "min" | "max", value: string) => void;
  onClose: () => void;
}

export default function ColumnFilterDropdown({
  columnKey,
  min,
  max,
  onFilterChange,
  onClose,
}: ColumnFilterDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div ref={ref} className="filter-dropdown">
      <div className="field">
        <label className="label is-small">Min</label>
        <div className="control">
          <input
            className="input is-small filter-input"
            type="number"
            placeholder="Min"
            value={min}
            onChange={(e) => onFilterChange(columnKey, "min", e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label className="label is-small">Max</label>
        <div className="control">
          <input
            className="input is-small filter-input"
            type="number"
            placeholder="Max"
            value={max}
            onChange={(e) => onFilterChange(columnKey, "max", e.target.value)}
          />
        </div>
      </div>
      <div className="is-flex" style={{ gap: "4px", justifyContent: "flex-end" }}>
        <button
          className="button is-small"
          onClick={() => {
            onFilterChange(columnKey, "min", "");
            onFilterChange(columnKey, "max", "");
          }}
        >
          Clear
        </button>
        <button className="button is-small is-info" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
