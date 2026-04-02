"use client";
import { PoolPreset, SimulationConfig } from "@/types/simulator";
import { fmtVolShort, fmtUsd } from "@/lib/api";
import styles from "./ConfigPanel.module.css";

interface Props {
  presets:     PoolPreset[];
  cfg:         SimulationConfig;
  activePreset: PoolPreset | null;
  token0Pct:   number;
  token0Amount: number;
  token1Amount: number;
  token0ValueUsd: number;
  token1ValueUsd: number;
  onPresetSelect: (p: PoolPreset) => void;
  onChange:    (patch: Partial<SimulationConfig>) => void;
}

const RANGE_PRESETS: [string, number][] = [
  ["±0.5%", 0.005], ["±1%", 0.01], ["±5%", 0.05],
  ["±10%", 0.10],   ["±15%", 0.15], ["±25%", 0.25], ["±50%", 0.50],
];

export default function ConfigPanel({
  presets, cfg, activePreset, token0Pct, token0Amount, token1Amount,
  token0ValueUsd, token1ValueUsd, onPresetSelect, onChange,
}: Props) {
  const p0 = (token0Pct * 100).toFixed(1);
  const p1 = (100 - token0Pct * 100).toFixed(1);
  const rangePct = cfg.currentPrice > 0
    ? ((cfg.upperPrice - cfg.lowerPrice) / cfg.currentPrice * 50).toFixed(1) : "0.0";

  function setRangePct(pct: number) {
    onChange({ lowerPrice: cfg.currentPrice * (1 - pct), upperPrice: cfg.currentPrice * (1 + pct) });
  }

  const t0s = token0Amount < 0.001 ? token0Amount.toFixed(6) : token0Amount.toFixed(4);
  const t1s = token1Amount < 100   ? token1Amount.toFixed(2) :
              token1Amount.toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <aside className={styles.panel}>

      {/* Pool presets */}
      <div>
        <div className={styles.slbl}>Pool</div>
        <div className={styles.presetList}>
          {presets.map(p => (
            <button
              key={p.id}
              className={`${styles.pill} ${activePreset?.id === p.id ? styles.active : ""}`}
              onClick={() => onPresetSelect(p)}
            >
              <span>{p.token0Symbol} / {p.token1Symbol}</span>
              <span className={styles.pillR}>
                <span className={styles.feeTag}>{p.feeLabel}</span>
                <span className={styles.volLbl}>{fmtVolShort(p.defaultVolume)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.divider} />

      {/* Market inputs */}
      <div>
        <div className={styles.slbl}>Market</div>
        <div className={styles.formStack}>
          <label className={styles.fg}>
            <span className={styles.fl}>Current price ({activePreset?.token1Symbol})</span>
            <div className={styles.fw}>
              <input className={styles.fi} type="number" step="any"
                value={cfg.currentPrice}
                onChange={e => onChange({ currentPrice: +e.target.value })} />
            </div>
          </label>
          <label className={styles.fg}>
            <span className={styles.fl}>24h volume (USD)</span>
            <div className={styles.fw}>
              <input className={styles.fi} type="number" step="100000"
                value={cfg.volume24hUsd}
                onChange={e => onChange({ volume24hUsd: +e.target.value })} />
            </div>
          </label>
        </div>
      </div>

      <div className={styles.divider} />

      {/* Range */}
      <div>
        <div className={styles.slbl} style={{ marginBottom: "8px" }}>Price range</div>
        <div className={styles.rangeRow}>
          {RANGE_PRESETS.map(([lbl, pct]) => {
            const half   = (cfg.upperPrice - cfg.lowerPrice) / 2;
            const actual = cfg.currentPrice > 0 ? half / cfg.currentPrice : 0;
            const sel    = Math.abs(actual - pct) < 0.001;
            return (
              <button key={lbl} className={`${styles.rb} ${sel ? styles.rbActive : ""}`}
                onClick={() => setRangePct(pct)}>{lbl}</button>
            );
          })}
        </div>
        <div className={styles.fgrid2}>
          <label className={styles.fg}>
            <span className={styles.fl}>Min price</span>
            <input className={styles.fi} type="number" step="any"
              value={+cfg.lowerPrice.toPrecision(8)}
              onChange={e => onChange({ lowerPrice: +e.target.value })} />
          </label>
          <label className={styles.fg}>
            <span className={styles.fl}>Max price</span>
            <input className={styles.fi} type="number" step="any"
              value={+cfg.upperPrice.toPrecision(8)}
              onChange={e => onChange({ upperPrice: +e.target.value })} />
          </label>
        </div>
        <div className={styles.fhint}>
          Range width: <span style={{ color: "var(--amber)" }}>±{rangePct}%</span>
          &nbsp;·&nbsp;{cfg.lowerPrice.toPrecision(6)} – {cfg.upperPrice.toPrecision(6)}
        </div>
      </div>

      <div className={styles.divider} />

      {/* Position */}
      <div>
        <div className={styles.slbl}>Position</div>
        <div className={styles.formStack}>
          <label className={styles.fg}>
            <span className={styles.fl}>Investment (USD)</span>
            <div className={styles.fw}>
              <input className={styles.fi} type="number" step="100" min="1"
                value={cfg.investmentUsd}
                onChange={e => onChange({ investmentUsd: +e.target.value })} />
            </div>
          </label>

          {/* Split bar */}
          <div>
            <div className={styles.splitBar}>
              <div className={styles.splitFill} style={{ width: `${+p0}%` }} />
            </div>
            <div className={styles.splitLbl}>
              <span>{activePreset?.token0Symbol} {p0}%</span>
              <span>{activePreset?.token1Symbol} {p1}%</span>
            </div>
            <div className={styles.splitAmounts}>
              <span>{t0s} {activePreset?.token0Symbol}
                &nbsp;<span style={{ color: "var(--tm)" }}>≈ {fmtUsd(token0ValueUsd)}</span>
              </span>
              <span>{t1s} {activePreset?.token1Symbol}
                &nbsp;<span style={{ color: "var(--tm)" }}>≈ {fmtUsd(token1ValueUsd)}</span>
              </span>
            </div>
          </div>

        </div>
      </div>

    </aside>
  );
}
