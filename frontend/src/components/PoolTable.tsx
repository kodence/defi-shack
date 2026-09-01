"use client";

import { useMemo, useState, useCallback } from "react";
import { Pool } from "@/types/pool";
import { ROWS_PER_PAGE, MAX_DISPLAY_ROWS } from "@/utils/constants";
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
  const { filters, setFilter, applyFilters } = useFilters();
  const { sortColumn, sortDirection, toggleSort, applySorting } = useSorting();

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
    return applyFilters(pools);
  }, [pools, applyFilters]);

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
    return applySorting(pools).slice(0, MAX_DISPLAY_ROWS);
  }, [pools, applySorting]);

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
      <div className="is-flex is-align-items-center mb-3" style={{ gap: "1rem" }}>
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
                  onSelect={handleSelect}
                />
              );
            })}
            {rowsToRender.length === 0 && (
              <tr>
                <td colSpan={10} className="has-text-centered">
                  No pools match the current filters.
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
