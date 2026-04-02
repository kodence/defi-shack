"use client";
import { ScenarioRow, PoolPreset } from "@/types/simulator";
import { fmtUsd } from "@/lib/api";
import styles from "./ScenarioTable.module.css";

interface Props { rows: ScenarioRow[]; preset: PoolPreset; }

function fmtPrice(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (v >= 1)    return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

export default function ScenarioTable({ rows, preset }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.title}>
        Scenario analysis
        <span className={styles.pill}>30-day horizon</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.tbl}>
          <thead>
            <tr>
              <th className={styles.thL}>Price ({preset.token1Symbol})</th>
              <th>Change</th>
              <th>Position</th>
              <th>IL%</th>
              <th>30d Fees</th>
              <th>Net PnL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const rowCls  = row.isCurrent ? styles.current : row.inRange ? styles.inRange : "";
              const chgCls  = row.priceChangePct > 0.01 ? styles.up : row.priceChangePct < -0.01 ? styles.dn : styles.zero;
              const netCls  = row.netPnlUsd >= 0 ? styles.netPos : styles.netNeg;
              const chgSign = row.priceChangePct >= 0 ? "+" : "";
              const netSign = row.netPnlUsd >= 0 ? "+" : "";
              const tag     = row.inRange
                ? <span className={styles.inTag}>{row.isCurrent ? "now" : "in range"}</span>
                : <span className={styles.outTag}>out</span>;
              return (
                <tr key={row.price} className={rowCls}>
                  <td className={styles.tdPrice}>{fmtPrice(row.price)}</td>
                  <td className={chgCls}>{chgSign}{row.priceChangePct.toFixed(1)}%</td>
                  <td>{fmtUsd(row.positionValue)}</td>
                  <td className={styles.tdIL}>{row.ilPct.toFixed(2)}%</td>
                  <td className={styles.tdFee}>
                    {row.inRange ? fmtUsd(row.fees30dUsd) : <span className={styles.dash}>—</span>}
                  </td>
                  <td className={netCls}>{netSign}{fmtUsd(row.netPnlUsd)} {tag}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
