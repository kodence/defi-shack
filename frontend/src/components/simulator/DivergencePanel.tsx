"use client";
import { useState } from "react";
import { DivergenceResult, SimPoolInfo, SimulationConfig } from "@/types/simulator";
import { fmtUsd } from "@/lib/api";
import styles from "./DivergencePanel.module.css";

interface Props {
  data:     DivergenceResult;
  pool:     SimPoolInfo;
  cfg:      SimulationConfig;
  onChange: (patch: Partial<SimulationConfig>) => void;
}

const VERDICT_LABEL = { fast: "fast", ok: "ok", slow: "slow" } as const;

function fmtRecovery(days: number): string {
  if (days === 0)  return "—";
  if (days < 0)    return "∞";
  if (days < 1)    return "<1d";
  if (days > 365)  return ">1y";
  return `${days.toFixed(1)}d`;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

// Metrix "Simulate Position Performance": enter both tokens' USD moves, see the
// divergence loss and how many days of fees are needed to cover it.
export default function DivergencePanel({ data, pool, cfg, onChange }: Props) {
  const [baseIn, setBaseIn]   = useState("");
  const [quoteIn, setQuoteIn] = useState("");

  const apply = () => {
    const b = parseFloat(baseIn), q = parseFloat(quoteIn);
    if (isNaN(b) && isNaN(q)) return;
    onChange({ dlScenarios: [{ basePct: (isNaN(b) ? 0 : b) / 100, quotePct: (isNaN(q) ? 0 : q) / 100 }] });
  };

  const clear = () => {
    setBaseIn(""); setQuoteIn("");
    if (cfg.dlScenarios?.length) onChange({ dlScenarios: [] });
  };

  const note =
    data.poolType === "crypto-crypto"
      ? "Crypto–crypto: simulate both directions — recovery within " +
        `${data.horizonDays}–${data.horizonDays * 2} days of fees is a green light.`
      : data.poolType === "crypto-stable"
      ? `Crypto–stable: divergence loss is expected when ${pool.baseSymbol} moves — ` +
        "the pool sells rises and buys dips. Judge income vs. exposure, not recovery speed."
      : "Stable–stable: divergence loss is negligible — focus on fee income.";

  return (
    <div className={styles.card}>
      <div className={styles.title}>
        Divergence loss
        <span className={styles.pill}>vs holding · {data.horizonDays}d moves</span>
      </div>

      {/* Custom scenario input */}
      <div className={styles.inputRow}>
        <label className={styles.inp}>
          <span>{pool.baseSymbol} %</span>
          <input type="number" step="1" placeholder="-10"
            value={baseIn} onChange={e => setBaseIn(e.target.value)}
            onKeyDown={e => e.key === "Enter" && apply()} />
        </label>
        <label className={styles.inp}>
          <span>{pool.quoteSymbol} %</span>
          <input type="number" step="1" placeholder="-13"
            value={quoteIn} onChange={e => setQuoteIn(e.target.value)}
            onKeyDown={e => e.key === "Enter" && apply()} />
        </label>
        <button className={styles.applyBtn} onClick={apply}>Simulate</button>
        {(cfg.dlScenarios?.length ?? 0) > 0 && (
          <button className={styles.clearBtn} onClick={clear}>×</button>
        )}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.tbl}>
          <thead>
            <tr>
              <th className={styles.thL}>Scenario ({pool.baseSymbol} / {pool.quoteSymbol})</th>
              <th>DL</th>
              <th title="Days of fees needed to cover the divergence loss">Recover</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.scenarios.map((s, i) => (
              <tr key={i} className={s.source === "custom" ? styles.customRow : ""}>
                <td className={styles.tdLabel}>
                  <div>
                    {s.label}
                    {s.source === "historical" && <span className={styles.histTag}>real</span>}
                    {!s.inRange && <span className={styles.outTag}>out</span>}
                  </div>
                  <div className={styles.moves}>
                    <span className={s.basePct >= 0 ? styles.up : styles.dn}>{pct(s.basePct)}</span>
                    {" / "}
                    <span className={s.quotePct >= 0 ? styles.up : styles.dn}>{pct(s.quotePct)}</span>
                  </div>
                </td>
                <td className={styles.tdDl}>
                  {s.divergenceLossUsd < -0.005 ? fmtUsd(s.divergenceLossUsd) : "$0"}
                </td>
                <td>{fmtRecovery(s.recoveryDays)}</td>
                <td>
                  <span className={`${styles.verdict} ${styles[s.verdict]}`}>
                    {VERDICT_LABEL[s.verdict]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.note}>{note}</div>
    </div>
  );
}
