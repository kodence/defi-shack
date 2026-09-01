"use client";
import { useMemo, useState } from "react";
import { SimulationConfig, SimulationResult } from "@/types/simulator";
import { fmtUsd } from "@/lib/api";
import styles from "./ValidChecklist.module.css";

interface Props {
  result: SimulationResult;
  cfg:    SimulationConfig;
}

type Status = "pass" | "warn" | "fail" | "na";

interface Check {
  letter: string;
  label:  string;
  status: Status;
  detail: string;
}

const ICON: Record<Status, string> = { pass: "✓", warn: "!", fail: "✗", na: "–" };

// VALID framework scorecard: auto-computed checks from the simulation plus the
// two judgment calls (volatility comfort, fundamentals) as manual toggles.
export default function ValidChecklist({ result, cfg }: Props) {
  const [volComfort, setVolComfort] = useState(false);
  const [fundamentals, setFundamentals] = useState(false);

  const pool = result.pool;
  const horizon = result.divergence.horizonDays;

  const checks = useMemo<Check[]>(() => {
    const out: Check[] = [];

    // A — APR & volume consistency (CV of daily volume, last 30 days)
    const vols = result.tvlHistory.slice(-30).map(d => d.volumeUsd).filter(v => v >= 0);
    let cv = 0;
    if (vols.length >= 2) {
      const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
      if (mean > 0) {
        const varr = vols.reduce((s, v) => s + (v - mean) ** 2, 0) / (vols.length - 1);
        cv = Math.sqrt(varr) / mean;
      }
    }
    out.push({
      letter: "A", label: "Volume consistency",
      status: cv === 0 ? "na" : cv <= 0.5 ? "pass" : cv <= 1.0 ? "warn" : "fail",
      detail: cv === 0 ? "no volume data" : `daily volume CV ${(cv * 100).toFixed(0)}% (lower = steadier)`,
    });

    // L — Loss recovery targets (worst simulated scenario vs 2× horizon rule)
    const candidates = result.divergence.scenarios.filter(s => s.recoveryDays !== 0);
    const worst = candidates.reduce(
      (w, s) => (s.recoveryDays < 0 || s.recoveryDays > w ? (s.recoveryDays < 0 ? Infinity : s.recoveryDays) : w),
      0,
    );
    const lStatus: Status =
      pool.poolType === "crypto-stable" ? "na" :
      candidates.length === 0 ? "pass" :
      worst <= horizon * 2 ? "pass" : worst <= 20 ? "warn" : "fail";
    out.push({
      letter: "L", label: "Loss recovery",
      status: lStatus,
      detail: pool.poolType === "crypto-stable"
        ? "expected DL for crypto–stable; judge income instead"
        : candidates.length === 0 ? "no divergence scenarios"
        : `worst scenario recovers in ${isFinite(worst) ? worst.toFixed(0) + "d" : "∞"} (target ≤ ${horizon * 2}d)`,
    });

    // I — Inter-asset correlation (30d), crypto-crypto only
    const corr = pool.correlation30d;
    out.push({
      letter: "I", label: "Correlation ≥ 0.5",
      status: pool.poolType !== "crypto-crypto" ? "na" :
        corr === undefined ? "na" :
        corr >= 0.5 ? "pass" : corr >= 0.3 ? "warn" : "fail",
      detail: pool.poolType !== "crypto-crypto"
        ? "n/a for stable-quoted pools"
        : corr === undefined ? "no correlation data"
        : `30d ${(corr * 100).toFixed(0)}%${pool.correlation7d !== undefined ? ` · 7d ${(pool.correlation7d * 100).toFixed(0)}%` : ""}`,
    });

    // D — Depth: how much of the realistic APR survives peak-liquidity competition
    const a = result.aprBreakdown;
    const ratio = a.realisticApr > 0 ? a.worstCaseApr / a.realisticApr : 0;
    out.push({
      letter: "D", label: "Liquidity depth",
      status: a.fallbackUniform ? "na" : ratio >= 0.5 ? "pass" : ratio >= 0.25 ? "warn" : "fail",
      detail: a.fallbackUniform
        ? "no tick data — uniform estimate"
        : `worst-case keeps ${(ratio * 100).toFixed(0)}% of realistic APR`,
    });

    // Position sizing (FATE): stay ≤ 5% of pool TVL
    const sizePct = pool.tvlUsd > 0 ? cfg.investmentUsd / pool.tvlUsd : 1;
    out.push({
      letter: "$", label: "Size ≤ 5% of TVL",
      status: sizePct <= 0.05 ? "pass" : sizePct <= 0.10 ? "warn" : "fail",
      detail: `${fmtUsd(cfg.investmentUsd)} = ${(sizePct * 100).toFixed(2)}% of ${fmtUsd(pool.tvlUsd)}`,
    });

    return out;
  }, [result, cfg.investmentUsd, pool, horizon]);

  const auto = checks.filter(c => c.status !== "na");
  const passes = auto.filter(c => c.status === "pass").length +
                 (volComfort ? 1 : 0) + (fundamentals ? 1 : 0);
  const total = auto.length + 2;

  return (
    <div className={styles.card}>
      <div className={styles.title}>
        VALID checklist
        <span className={styles.pill}>{passes}/{total} green</span>
      </div>

      <div className={styles.list}>
        {checks.map(c => (
          <div key={c.letter + c.label} className={styles.row}>
            <span className={`${styles.icon} ${styles[c.status]}`}>{ICON[c.status]}</span>
            <span className={styles.letter}>{c.letter}</span>
            <span className={styles.lbl}>
              {c.label}
              <span className={styles.detail}>{c.detail}</span>
            </span>
          </div>
        ))}

        {/* Manual judgment calls */}
        <label className={styles.row} style={{ cursor: "pointer" }}>
          <input type="checkbox" className={styles.chk} checked={volComfort}
            onChange={e => setVolComfort(e.target.checked)} />
          <span className={styles.letter}>V</span>
          <span className={styles.lbl}>
            Volatility comfort
            <span className={styles.detail}>
              {(pool.annualVolatility * 100).toFixed(0)}% annualized · can you sit through the swings?
            </span>
          </span>
        </label>
        <label className={styles.row} style={{ cursor: "pointer" }}>
          <input type="checkbox" className={styles.chk} checked={fundamentals}
            onChange={e => setFundamentals(e.target.checked)} />
          <span className={styles.letter}>F</span>
          <span className={styles.lbl}>
            Fundamentals
            <span className={styles.detail}>
              I understand {pool.baseSymbol} and {pool.quoteSymbol} and want to hold them
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
