"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { Pool } from "@/types/pool";
import {
  ROWS_PER_PAGE, MAX_DISPLAY_ROWS, COLUMNS, COLUMN_PREFS_KEY, SortableColumn,
} from "@/utils/constants";
import TableHeader from "./TableHeader";
import PoolRow from "./PoolRow";
import Pagination from "./Pagination";
import { useFilters } from "@/hooks/useFilters";
import { useSorting } from "@/hooks/useSorting";

interface PoolTableProps {
  pools: Pool[];
  hideFiltered: boolean;
}

export default function PoolTable({ pools, hideFiltered }: PoolTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [showOnlyChecked, setShowOnlyChecked] = useState(false);
  const [assetQuery, setAssetQuery] = useState("");
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    () => new Set(COLUMNS.filter((c) => c.defaultHidden).map((c) => c.key))
  );
  const [columnsOpen, setColumnsOpen] = useState(false);

  // Remember the choice, so re-showing a column survives a reload
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_PREFS_KEY);
      if (saved) setHiddenColumns(new Set(JSON.parse(saved) as string[]));
    } catch {
      // keep the defaults
    }
  }, []);

  const toggleColumn = useCallback((key: SortableColumn) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify([...next]));
      } catch {
        // preference just will not persist
      }
      return next;
    });
  }, []);

  const visibleColumns = useMemo(
    () => COLUMNS.filter((c) => !hiddenColumns.has(c.key)),
    [hiddenColumns]
  );
  const isVisible = useCallback(
    (key: SortableColumn) => !hiddenColumns.has(key),
    [hiddenColumns]
  );
  const { filters, setFilter, applyFilters, clearFilters, applyFatePreset, fateActive } = useFilters();
  const { sortColumn, sortDirection, toggleSort, applySorting } = useSorting();

  // FATE "Fundamentals": restrict to pools containing the given asset symbols
  const assetPools = useMemo(() => {
    const terms = assetQuery
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (!terms.length) return pools;
    return pools.filter((p) =>
      terms.some(
        (t) =>
          p.token0.symbol.toUpperCase().includes(t) ||
          p.token1.symbol.toUpperCase().includes(t)
      )
    );
  }, [pools, assetQuery]);

  const handleSelect = useCallback((poolId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(poolId)) {
        next.delete(poolId);
      } else {
        next.add(poolId);
      }
      return next;
    });
  }, []);

  const filteredPools = useMemo(() => {
    return applyFilters(assetPools);
  }, [assetPools, applyFilters]);

  const sortedPools = useMemo(() => {
    return applySorting(filteredPools);
  }, [filteredPools, applySorting]);

  // Cap at MAX_DISPLAY_ROWS (100)
  const displayPools = useMemo(() => {
    return sortedPools.slice(0, MAX_DISPLAY_ROWS);
  }, [sortedPools]);

  const filteredIds = useMemo(() => {
    return new Set(filteredPools.map((p) => p.id));
  }, [filteredPools]);

  const allSorted = useMemo(() => {
    return applySorting(assetPools).slice(0, MAX_DISPLAY_ROWS);
  }, [assetPools, applySorting]);

  const showAll = !hideFiltered;
  const basePools = showAll ? allSorted : displayPools;

  // Apply "show only checked" filter
  const effectivePools = useMemo(() => {
    if (!showOnlyChecked || checkedIds.size === 0) return basePools;
    return basePools.filter((p) => checkedIds.has(p.id));
  }, [basePools, showOnlyChecked, checkedIds]);

  const totalPages = Math.min(
    Math.ceil(effectivePools.length / ROWS_PER_PAGE),
    5
  );

  // Reset page when filters change
  const safeCurrentPage = Math.min(currentPage, Math.max(totalPages, 1));
  if (safeCurrentPage !== currentPage) {
    setCurrentPage(safeCurrentPage);
  }

  const pageStart = (safeCurrentPage - 1) * ROWS_PER_PAGE;
  const pageEnd = pageStart + ROWS_PER_PAGE;
  const rowsToRender = effectivePools.slice(pageStart, pageEnd);

  return (
    <div>
      <div className="is-flex is-align-items-center is-flex-wrap-wrap mb-3" style={{ gap: "1rem" }}>
        <button
          className={`button is-small ${fateActive ? "is-primary" : "is-primary is-outlined"}`}
          title="Apply FATE framework filters: APR 30–500%, TVL ≥ $1M, volatility < 15%, correlation ≥ 0.5"
          onClick={applyFatePreset}
        >
          FATE filters{fateActive ? " ✓" : ""}
        </button>
        <button className="button is-small is-light" onClick={clearFilters}>
          Reset filters
        </button>
        <input
          className="input is-small"
          style={{ maxWidth: "230px" }}
          type="text"
          placeholder="Filter by asset (e.g. ETH, LINK)"
          value={assetQuery}
          onChange={(e) => setAssetQuery(e.target.value)}
        />
        <div className={`dropdown ${columnsOpen ? "is-active" : ""}`}>
          <div className="dropdown-trigger">
            <button
              type="button"
              className="button is-small"
              onClick={() => setColumnsOpen((v) => !v)}
              title="Choose which columns to show"
            >
              Columns
              {hiddenColumns.size > 0 && (
                <span className="tag is-light ml-2">{hiddenColumns.size} hidden</span>
              )}
            </button>
          </div>
          <div className="dropdown-menu" role="menu">
            <div className="dropdown-content" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {COLUMNS.map((col) => (
                <label
                  key={col.key}
                  className="dropdown-item"
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.has(col.key)}
                    onChange={() => toggleColumn(col.key)}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <label className="checkbox is-small">
          <input
            type="checkbox"
            checked={showOnlyChecked}
            onChange={(e) => setShowOnlyChecked(e.target.checked)}
          />{" "}
          Show only selected pools
        </label>
        {checkedIds.size > 0 && (
          <span className="tag is-info is-light">{checkedIds.size} selected</span>
        )}
      </div>

      <div className="table-container">
        <table className="table is-fullwidth is-striped is-hoverable is-narrow">
          <thead>
            <TableHeader
              columns={visibleColumns}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={toggleSort}
              filters={filters}
              onFilterChange={setFilter}
            />
          </thead>
          <tbody>
            {rowsToRender.map((pool) => {
              const passesFilter = filteredIds.has(pool.id);
              const dimmed = showAll && !passesFilter;
              return (
                <PoolRow
                  key={pool.id}
                  pool={pool}
                  dimmed={dimmed}
                  selected={checkedIds.has(pool.id)}
                  show={isVisible}
                  onSelect={handleSelect}
                />
              );
            })}
            {rowsToRender.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="has-text-centered">
                  No pools match the current filters.
                  {fateActive && (
                    <div className="is-size-7 has-text-grey mt-1">
                      FATE thresholds (APR 30–500%, TVL ≥ $1M, volatility &lt; 15%) are strict by
                      design — try more networks, or relax a bound via the column filters
                      (volatility is often the binding one in volatile weeks).
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <Pagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
        <p className="has-text-grey is-size-7 has-text-centered mt-2">
          Showing {rowsToRender.length} of {effectivePools.length} pools
          {!hideFiltered && ` (${filteredPools.length} match filters)`}
        </p>
      </div>
    </div>
  );
}
