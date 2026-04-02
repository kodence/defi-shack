"use client";
import { AprHistoryResult } from "@/types/simulator";
import { fmtUsd, fmtPct } from "@/lib/api";
import styles from "./AprHistory.module.css";

interface Props { data: AprHistoryResult; }

export default function AprHistory({ data }: Props) {
  const { dailySamplesB: samples, averageAprB, weightedAprB } = data;
  if (!samples.length) return null;

  /* ── Mini bar chart ─────────────────────────────────────────────────────── */
  const W = 680, H = 120, PL = 52, PR = 10, PT = 8, PB = 22;
  const cW = W - PL - PR, cH = H - PT - PB;
  const maxApr = Math.max(...samples.map(s => s.dailyApr), 0.01);
  const barW   = (cW / samples.length) - 1;

  const barBotY  = PT + cH;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.title}>
          30-day APR history
          <span className={styles.pill}>volume-based estimate</span>
        </div>
        <div className={styles.summary}>
          <div className={styles.kv}>
            <span className={styles.kLabel}>Simple avg</span>
            <span className={styles.kVal}>{fmtPct(averageAprB)}</span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kLabel}>Weighted avg</span>
            <span className={`${styles.kVal} ${styles.accent}`}>{fmtPct(weightedAprB)}</span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kLabel}>In-range days</span>
            <span className={styles.kVal}>{samples.filter(s => s.inRange).length} / {samples.length}</span>
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} style={{ height: H }}>
        {/* Y grid */}
        {[0.25, 0.5, 0.75, 1.0].map(r => {
          const v  = maxApr * r;
          const ty = (PT + cH * (1 - r)).toFixed(1);
          return (
            <g key={r}>
              <line x1={PL} y1={ty} x2={W - PR} y2={ty} stroke="#21262d" strokeWidth=".5" />
              <text x={PL - 4} y={ty} fontSize="10" fill="#484f58" textAnchor="end" dominantBaseline="central">
                {(v * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {samples.map((s, i) => {
          const barH  = maxApr > 0 ? (s.dailyApr / maxApr) * cH : 0;
          const x     = (PL + i * (barW + 1)).toFixed(1);
          const y     = (barBotY - barH).toFixed(1);
          const fill  = s.inRange ? "#3fb950" : "#30363d";
          return (
            <rect key={i} x={x} y={y} width={barW.toFixed(1)} height={barH.toFixed(1)}
              fill={fill} rx="1" opacity={s.inRange ? "1" : "0.5"}>
              <title>
                Day {i + 1} · APR: {(s.dailyApr * 100).toFixed(2)}% · Fees: {fmtUsd(s.feesUsd)} · {s.inRange ? "In range" : "Out of range"}
              </title>
            </rect>
          );
        })}

        {/* X axis: first, mid, last labels */}
        {[0, 14, 29].map(i => {
          if (i >= samples.length) return null;
          const s    = samples[i];
          const date = new Date(s.timestampUnix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const cx   = (PL + i * (barW + 1) + barW / 2).toFixed(1);
          return (
            <text key={i} x={cx} y={(barBotY + 14).toFixed(1)} fontSize="10" fill="#484f58" textAnchor="middle">
              {date}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className={styles.legend}>
        <span className={styles.li}><span className={styles.dot} style={{ background: "#3fb950" }} />In-range (fees accruing)</span>
        <span className={styles.li}><span className={styles.dot} style={{ background: "#30363d" }} />Out of range (0 fees)</span>
        <span className={styles.li} style={{ marginLeft: "auto", color: "var(--tm)" }}>Hover bars for daily detail</span>
      </div>

      {/* Last 7 days table */}
      <div className={styles.tableWrap}>
        <div className={styles.tableTitle}>Last 7 days</div>
        <table className={styles.tbl}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Daily APR</th>
              <th>Fees (USD)</th>
              <th>Position value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {samples.slice(-7).map((s, i) => {
              const date = new Date(s.timestampUnix * 1000).toLocaleDateString("en-US",
                { month: "short", day: "numeric" });
              return (
                <tr key={i} className={s.inRange ? styles.inRange : ""}>
                  <td>{date}</td>
                  <td className={s.inRange ? styles.aprGreen : styles.aprGray}>
                    {s.inRange ? fmtPct(s.dailyApr) : "—"}
                  </td>
                  <td className={styles.feeGreen}>{s.inRange ? fmtUsd(s.feesUsd, 4) : <span style={{ color: "var(--tm)" }}>—</span>}</td>
                  <td>{fmtUsd(s.positionValueUsd)}</td>
                  <td>{s.inRange
                    ? <span className={styles.inTag}>in range</span>
                    : <span className={styles.outTag}>out</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
