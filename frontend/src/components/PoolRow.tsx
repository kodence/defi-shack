"use client";

import { Pool } from "@/types/pool";
import { formatUSD, formatPercent, formatCorrelation } from "@/utils/format";

interface PoolRowProps {
  pool: Pool;
  dimmed?: boolean;
  checked: boolean;
  onCheckChange: (poolId: string, checked: boolean) => void;
}

export default function PoolRow({ pool, dimmed, checked, onCheckChange }: PoolRowProps) {
  return (
    <tr style={dimmed ? { opacity: 0.4 } : undefined}>
      <td>{pool.poolName}</td>
      <td>{pool.exchange}</td>
      <td>{pool.network}</td>
      <td>{formatUSD(pool.tvl)}</td>
      <td>{formatPercent(pool.apr)}</td>
      <td>{formatUSD(pool.avgDailyFees)}</td>
      <td>{formatUSD(pool.avgDailyVolume)}</td>
      <td>{formatCorrelation(pool.correlation)}</td>
      <td>{formatPercent(pool.priceVolatility)}</td>
      <td>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckChange(pool.id, e.target.checked)}
        />
      </td>
    </tr>
  );
}
