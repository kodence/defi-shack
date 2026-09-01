"use client";
import { AprBreakdown, PositionMetrics } from "@/types/simulator";
import { fmtUsd, fmtX } from "@/lib/api";
import styles from "./MetricCards.module.css";

const METHOD_LABEL: Record<string, string> = {
  current: "current price", peak: "peak in range", average: "avg. in range", custom: "custom price",
};

export default function MetricCards({ m, apr }: { m: PositionMetrics; apr: AprBreakdown }) {
  const worst   = Math.min(m.ilAtLower, m.ilAtUpper);
  const beText  = isFinite(m.breakevenDays) ? `break-even ~${m.breakevenDays.toFixed(0)}d` : "break-even N/A";
  const isLiveCalc = apr.volumeWindow > 0;

  return (
    <div className={styles.grid}>
      <div className={`${styles.card} ${styles.green}`}>
        <div className={styles.label}>
          Est. Annual APR
          {isLiveCalc && <span className={styles.tag}>{METHOD_LABEL[apr.method]}</span>}
        </div>
        <div className={styles.value}>{(m.estimatedApr * 100).toFixed(1)}%</div>
        <div className={styles.sub}>
          {fmtUsd(m.dailyFeesUsd)}/day
          {isLiveCalc
            ? <> · worst-case <strong>{(apr.worstCaseApr * 100).toFixed(1)}%</strong></>
            : <> · {fmtUsd(m.dailyFeesUsd * 30)}/30d</>}
        </div>
      </div>
      <div className={`${styles.card} ${styles.blue}`}>
        <div className={styles.label}>Capital Efficiency</div>
        <div className={styles.value}>{fmtX(m.capitalEfficiency)}</div>
        <div className={styles.sub}>vs full-range position</div>
      </div>
      <div className={`${styles.card} ${styles.red}`}>
        <div className={styles.label}>IL at Boundary</div>
        <div className={styles.value}>{(worst * 100).toFixed(2)}%</div>
        <div className={styles.sub}>
          {(m.ilAtLower * 100).toFixed(2)}% at min · {(m.ilAtUpper * 100).toFixed(2)}% at max
        </div>
      </div>
      <div className={`${styles.card} ${styles.purple}`}>
        <div className={styles.label}>30d In-Range Prob.</div>
        <div className={styles.value}>{(m.inRangeProb30d * 100).toFixed(0)}%</div>
        <div className={styles.sub}>{beText}</div>
      </div>
    </div>
  );
}
