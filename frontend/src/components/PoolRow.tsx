"use client";

import Link from "next/link";
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

export default function PoolRow({ pool, dimmed, selected, show, onSelect }: PoolRowProps) {
  const exchangeIcon = EXCHANGE_ICONS[pool.exchange];
  const networkIcon = NETWORK_ICONS[pool.network];

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
        <td>
          {exchangeIcon && <img src={exchangeIcon} alt="" className="cell-icon" />}
          {pool.exchange}
        </td>
      )}
      {show("network") && (
        <td>
          {networkIcon && <img src={networkIcon} alt="" className="cell-icon" />}
          {pool.network}
        </td>
      )}
      {show("tvl") && (
        <td title={pool.tvlSource === "subgraph"
          ? "Tick data unavailable - falls back to the subgraph's reported TVL, which runs high"
          : "Rebuilt from tick liquidity"}>
          {formatUSD(pool.tvl)}
          {pool.tvlSource === "subgraph" && <span className="has-text-grey"> *</span>}
        </td>
      )}
      {show("apr") && (
        <td title="Fees spread across all liquidity, including positions far out of range">
          {formatPercent(pool.apr)}
        </td>
      )}
      {show("activeApr") && (
        <td
          title="What a $10,000 position within 2% of spot would have earned against the window's average in-range liquidity"
          className={pool.activeApr !== null && pool.activeApr >= 30 ? "has-text-weight-semibold" : undefined}
        >
          {pool.activeApr === null ? "-" : formatPercent(pool.activeApr)}
        </td>
      )}
      {show("liveActiveApr") && (
        <td
          title="Same, measured against today's in-range liquidity rather than the window average - the basis Metrix Finance quotes"
          className={pool.liveActiveApr !== null && pool.liveActiveApr >= 30 ? "has-text-weight-semibold" : undefined}
        >
          {pool.liveActiveApr === null ? "-" : formatPercent(pool.liveActiveApr)}
        </td>
      )}
      {show("avgDailyFees") && (
        <td>{formatUSD(pool.avgDailyFees)}</td>
      )}
      {show("avgDailyVolume") && (
        <td>{formatUSD(pool.avgDailyVolume)}</td>
      )}
      {show("activeTvl") && (
        <td title="Liquidity within 2% of spot, averaged over the timeframe">
          {pool.activeTvl === null ? "-" : formatUSD(pool.activeTvl)}
        </td>
      )}
      {show("liveActiveTvl") && (
        <td title="Liquidity within 2% of spot right now - what a deposit would compete with today. Does not change with the timeframe.">
          {pool.liveActiveTvl === null ? "-" : formatUSD(pool.liveActiveTvl)}
        </td>
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
          style={pool.volumeCV > 1 ? { color: "hsl(348, 86%, 51%)" } : undefined}
        >
          {(pool.volumeCV * 100).toFixed(0)}%
        </td>
      )}
      {show("correlation") && (
        <td>
          {formatCorrelation(pool.correlation)}
          <div style={{ fontSize: "0.68rem", color: "#7a7a7a", whiteSpace: "nowrap" }}>
            7d {(pool.correlation7d * 100).toFixed(0)}% · 30d {(pool.correlation30d * 100).toFixed(0)}%
          </div>
        </td>
      )}
      {show("priceVolatility") && (
        <td>{formatPercent(pool.priceVolatility)}</td>
      )}
      <td onClick={(e) => e.stopPropagation()}>
        <Link
          className="button is-small is-link is-outlined"
          href={`/simulator?network=${pool.networkId}&pool=${pool.id}`}
          title="Simulate a position in this pool"
        >
          Simulate
        </Link>
      </td>
    </tr>
  );
}
