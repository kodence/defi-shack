"use client";
import { RangePreset, SimulationConfig } from "@/types/simulator";
import styles from "./RangePresets.module.css";

interface Props {
  presets:  RangePreset[];
  onChange: (patch: Partial<SimulationConfig>) => void;
}

// The same deposit priced at standard widths. Discovery's APR describes the
// pool and cannot know the range you pick; this is where that turns into a
// number for a position, and it shows the cost of a tight range alongside it.
export default function RangePresets({ presets, onChange }: Props) {
  if (!presets.length) return null;

  const best = Math.max(...presets.map(p => p.apr));

  return (
    <div className={styles.card}>
      <div className={styles.title}>
        Range presets
        <span className={styles.pill}>APR at standard widths</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.tbl}>
          <thead>
            <tr>
              <th className={styles.thL}>Width</th>
              <th>APR</th>
              <th title="Chance the price is still inside this range in 30 days">In range 30d</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {presets.map(p => {
              const prob = p.inRangeProb30d;
              const probCls = prob >= 0.7 ? styles.good : prob >= 0.4 ? styles.warn : styles.bad;
              return (
                <tr
                  key={p.widthPct}
                  className={p.isCurrent ? styles.current : ""}
                  onClick={() => onChange({ lowerPrice: p.lowerPrice, upperPrice: p.upperPrice })}
                  title="Apply this range"
                >
                  <td className={styles.tdW}>
                    &plusmn;{(p.widthPct * 100).toFixed(p.widthPct < 0.01 ? 1 : 0)}%
                  </td>
                  <td className={styles.tdApr}>
                    {(p.apr * 100).toFixed(p.apr < 1 ? 1 : 0)}%
                  </td>
                  <td className={probCls}>{(prob * 100).toFixed(0)}%</td>
                  <td className={styles.tdBar}>
                    <span
                      className={styles.bar}
                      style={{ width: `${best > 0 ? Math.max((p.apr / best) * 100, 2) : 0}%` }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={styles.note}>
        Tightening the range multiplies APR and shortens how long you stay in it. Read the two
        columns together &mdash; the highest APR here is rarely the best position.
      </p>
    </div>
  );
}
