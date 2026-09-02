"use client";

import Link from "next/link";
import { useState } from "react";
import { Pool } from "@/types/pool";
import { formatUSD, formatPercent, formatCorrelation } from "@/utils/format";
import {
  EXCHANGE_ICONS, NETWORK_ICONS, FEE_TO_TVL_TARGET, SortableColumn,
} from "@/utils/constants";

interface PoolRowProps {
  pool: Pool;
  dimmed?: boolean;
  selected: boolean;
  show: (key: SortableColumn) => boolean;
  onSelect: (poolId: string) => void;
}

// Icon files are optional: a network or exchange without one renders as an
// initials chip instead of a broken image.
function SourceIcon({ src, label }: { src?: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt="" className="cell-icon" onError={() => setFailed(true)} />;
  }
  const initials = label.split(/[\s-]+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <span className="cell-icon cell-icon--fallback" aria-hidden="true">{initials}</span>;
}

// Series-derived columns are null where the source has no daily price data
const dash = <span className="has-text-grey" title="Not available from this source">—</span>;

export default function PoolRow({ pool, dimmed, selected, show, onSelect }: PoolRowProps) {
  const exchangeIcon = EXCHANGE_ICONS[pool.exchangeId];
  const networkIcon = NETWORK_ICONS[pool.networkId];
  const exchangeParam = pool.exchangeId !== "uniswap-v3" ? `&exchange=${pool.exchangeId}` : "";

  return (
    <tr
      className={selected ? "row-selected" : ""}
      style={{
        ...(dimmed ? { opacity: 0.4 } : undefined),
        cursor: "pointer",
      }}
      onClick={() => onSelect(pool.id)}
    >
      {show("poolName") && (
        <td>{pool.poolName}</td>
      )}
      {show("exchange") && (
        <td className="cell-source" title={pool.sourceNote}>
          <SourceIcon src={exchangeIcon} label={pool.exchange} />
          {pool.exchange}
          {pool.sourceNote && <span className="has-text-grey"> †</span>}
        </td>
      )}
      {show("network") && (
        <td className="cell-source">
          <SourceIcon src={networkIcon} label={pool.network} />
          {pool.network}
        </td>
      )}
      {show("tvl") && (
        <td title={
          pool.tvlSource === "subgraph"
            ? "Tick data unavailable - falls back to the subgraph's reported TVL, which runs high"
            : pool.tvlSource === "api"
              ? "As reported by the source's API"
              : "Rebuilt from tick liquidity"
        }>
          {formatUSD(pool.tvl)}
          {pool.tvlSource === "subgraph" && <span className="has-text-grey"> *</span>}
        </td>
      )}
      {show("apr") && (
        <td title="Fees spread across all liquidity, including positions far out of range">
          {formatPercent(pool.apr)}
        </td>
      )}
      {show("avgDailyFees") && (
        <td>{formatUSD(pool.avgDailyFees)}</td>
      )}
      {show("avgDailyVolume") && (
        <td>{formatUSD(pool.avgDailyVolume)}</td>
      )}
      {show("feeToTvlPct") && (
        <td
          title="Avg daily fees ÷ avg TVL — FATE targets ≥ 0.059% for actively traded pools"
          style={pool.feeToTvlPct >= FEE_TO_TVL_TARGET ? { color: "hsl(141, 53%, 41%)", fontWeight: 600 } : undefined}
        >
          {pool.feeToTvlPct.toFixed(3)}%
        </td>
      )}
      {show("volumeCV") && (
        <td
          title="Volume coefficient of variation — lower means more consistent volume"
          style={pool.volumeCV !== null && pool.volumeCV > 1 ? { color: "hsl(348, 86%, 51%)" } : undefined}
        >
          {pool.volumeCV === null ? dash : `${(pool.volumeCV * 100).toFixed(0)}%`}
        </td>
      )}
      {show("correlation") && (
        <td>
          {pool.correlation === null ? dash : (
            <>
              {formatCorrelation(pool.correlation)}
              <div style={{ fontSize: "0.68rem", color: "var(--tm)", whiteSpace: "nowrap" }}>
                7d {formatPercent(pool.correlation7d === null ? null : pool.correlation7d * 100, 0)}
                {" · "}
                30d {formatPercent(pool.correlation30d === null ? null : pool.correlation30d * 100, 0)}
              </div>
            </>
          )}
        </td>
      )}
      {show("priceVolatility") && (
        <td>{pool.priceVolatility === null ? dash : formatPercent(pool.priceVolatility)}</td>
      )}
      <td onClick={(e) => e.stopPropagation()}>
        {pool.canSimulate ? (
          <Link
            className="button is-small is-link is-outlined"
            href={`/simulator?network=${pool.networkId}&pool=${pool.id}${exchangeParam}`}
            title="Simulate a position in this pool"
          >
            Simulate
          </Link>
        ) : (
          <button
            className="button is-small is-outlined"
            disabled
            title="Simulation needs tick liquidity and daily price history, which this source does not provide"
          >
            Simulate
          </button>
        )}
      </td>
    </tr>
  );
}
