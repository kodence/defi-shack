"use client";

import Link from "next/link";
import { Pool } from "@/types/pool";
import { formatUSD, formatPercent, formatCorrelation } from "@/utils/format";
import { EXCHANGE_ICONS, NETWORK_ICONS, FEE_TO_TVL_TARGET } from "@/utils/constants";

interface PoolRowProps {
  pool: Pool;
  dimmed?: boolean;
  selected: boolean;
  onSelect: (poolId: string) => void;
}

export default function PoolRow({ pool, dimmed, selected, onSelect }: PoolRowProps) {
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
      <td>{pool.poolName}</td>
      <td>
        {exchangeIcon && <img src={exchangeIcon} alt="" className="cell-icon" />}
        {pool.exchange}
      </td>
      <td>
        {networkIcon && <img src={networkIcon} alt="" className="cell-icon" />}
        {pool.network}
      </td>
      <td>{formatUSD(pool.tvl)}</td>
      <td>{formatPercent(pool.apr)}</td>
      <td>{formatUSD(pool.avgDailyFees)}</td>
      <td>{formatUSD(pool.avgDailyVolume)}</td>
      <td
        title="Avg daily fees ÷ avg TVL — FATE targets ≥ 0.059% for actively traded pools"
        style={pool.feeToTvlPct >= FEE_TO_TVL_TARGET ? { color: "hsl(141, 53%, 41%)", fontWeight: 600 } : undefined}
      >
        {pool.feeToTvlPct.toFixed(3)}%
      </td>
      <td
        title="Volume coefficient of variation — lower means more consistent volume"
        style={pool.volumeCV > 1 ? { color: "hsl(348, 86%, 51%)" } : undefined}
      >
        {(pool.volumeCV * 100).toFixed(0)}%
      </td>
      <td>
        {formatCorrelation(pool.correlation)}
        <div style={{ fontSize: "0.68rem", color: "#7a7a7a", whiteSpace: "nowrap" }}>
          7d {(pool.correlation7d * 100).toFixed(0)}% · 30d {(pool.correlation30d * 100).toFixed(0)}%
        </div>
      </td>
      <td>{formatPercent(pool.priceVolatility)}</td>
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
