"use client";
import Link from "next/link";
import { AprBreakdown, CalcMethod, PoolPreset, SimPoolInfo, SimulationConfig } from "@/types/simulator";
import { fmtVolShort, fmtUsd } from "@/lib/api";
import styles from "./ConfigPanel.module.css";

interface Props {
  presets:       PoolPreset[];
  cfg:           SimulationConfig;
  activePreset:  PoolPreset | null;
  pool:          SimPoolInfo | null;
  aprBreakdown:  AprBreakdown | null;
  basePct:       number;
  baseAmount:    number;
  quoteAmount:   number;
  baseValueUsd:  number;
  quoteValueUsd: number;
  onPresetSelect: (p: PoolPreset) => void;
  onChange:       (patch: Partial<SimulationConfig>) => void;
  onInvert:       () => void;
}

const RANGE_PRESETS: [string, number][] = [
  ["±0.5%", 0.005], ["±1%", 0.01], ["±5%", 0.05],
  ["±10%", 0.10],   ["±15%", 0.15], ["±25%", 0.25], ["±50%", 0.50],
];

const CALC_METHODS: { key: CalcMethod; label: string; hint: string }[] = [
  { key: "current", label: "Current price",  hint: "liquidity at the current tick" },
  { key: "peak",    label: "Peak in range",  hint: "most competitive point (worst case)" },
  { key: "average", label: "Avg. in range",  hint: "smoothed across your range" },
  { key: "custom",  label: "Custom price",   hint: "liquidity at a price you pick" },
];

export default function ConfigPanel({
  presets, cfg, activePreset, pool, aprBreakdown,
  basePct, baseAmount, quoteAmount, baseValueUsd, quoteValueUsd,
  onPresetSelect, onChange, onInvert,
}: Props) {
  const isLive = Boolean(cfg.poolId);
  const baseSym  = pool?.baseSymbol  ?? activePreset?.token0Symbol ?? "";
  const quoteSym = pool?.quoteSymbol ?? activePreset?.token1Symbol ?? "";

  const p0 = (basePct * 100).toFixed(1);
  const p1 = (100 - basePct * 100).toFixed(1);
  const rangePct = cfg.currentPrice > 0
    ? ((cfg.upperPrice - cfg.lowerPrice) / cfg.currentPrice * 50).toFixed(1) : "0.0";

  function setRangePct(pct: number) {
    onChange({ lowerPrice: cfg.currentPrice * (1 - pct), upperPrice: cfg.currentPrice * (1 + pct) });
  }

  const t0s = baseAmount < 0.001 ? baseAmount.toFixed(6) : baseAmount.toFixed(4);
  const t1s = quoteAmount < 100  ? quoteAmount.toFixed(2) :
              quoteAmount.toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <aside className={styles.panel}>

      {/* Pool source */}
      {isLive && pool ? (
        <div>
          <div className={styles.slbl}>Pool · live data</div>
          <div className={styles.liveCard}>
            <div className={styles.liveName}>
              {pool.name}
              <span className={styles.feeTag}>{pool.feeLabel}</span>
            </div>
            <div className={styles.liveMeta}>
              <span>{pool.networkName}</span>
              <span>TVL {fmtUsd(pool.tvlUsd)}</span>
              <span>{pool.poolType}</span>
            </div>
            <Link href="/" className={styles.backLink}>← Back to discovery</Link>
          </div>
        </div>
      ) : (
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
      )}

      <div className={styles.divider} />

      {/* Market inputs */}
      <div>
        <div className={styles.slbl}>Market</div>
        <div className={styles.formStack}>
          <label className={styles.fg}>
            <span className={styles.fl}>
              Current price ({quoteSym} per {baseSym})
              {pool?.invertible && (
                <button className={styles.flipBtn} onClick={e => { e.preventDefault(); onInvert(); }}
                  title="Flip base / quote orientation">
                  ⇅ flip
                </button>
              )}
            </span>
            <div className={styles.fw}>
              <input className={styles.fi} type="number" step="any"
                value={+cfg.currentPrice.toPrecision(8)}
                onChange={e => onChange({ currentPrice: +e.target.value })} />
            </div>
          </label>
          {!isLive && (
            <label className={styles.fg}>
              <span className={styles.fl}>24h volume (USD)</span>
              <div className={styles.fw}>
                <input className={styles.fi} type="number" step="100000"
                  value={cfg.volume24hUsd}
                  onChange={e => onChange({ volume24hUsd: +e.target.value })} />
              </div>
            </label>
          )}
        </div>
      </div>

      {/* Realistic APR controls (live pools) */}
      {isLive && (
        <>
          <div className={styles.divider} />
          <div>
            <div className={styles.slbl}>APR calculation</div>
            <div className={styles.formStack}>
              <label className={styles.fg}>
                <span className={styles.fl}>Calculation method</span>
                <select
                  className={styles.fsel}
                  value={cfg.calcMethod ?? "current"}
                  onChange={e => onChange({ calcMethod: e.target.value as CalcMethod })}
                >
                  {CALC_METHODS.map(mth => (
                    <option key={mth.key} value={mth.key}>{mth.label}</option>
                  ))}
                </select>
                <span className={styles.fhint}>
                  {CALC_METHODS.find(x => x.key === (cfg.calcMethod ?? "current"))?.hint}
                </span>
              </label>

              {cfg.calcMethod === "custom" && (
                <label className={styles.fg}>
                  <span className={styles.fl}>Custom calc price</span>
                  <input className={styles.fi} type="number" step="any"
                    value={+(cfg.customCalcPrice ?? cfg.currentPrice).toPrecision(8)}
                    onChange={e => onChange({ customCalcPrice: +e.target.value })} />
                </label>
              )}

              <div className={styles.fg}>
                <span className={styles.fl}>Volume time frame</span>
                <div className={styles.rangeRow}>
                  {([7, 21, 30] as const).map(w => (
                    <button key={w}
                      className={`${styles.rb} ${(cfg.volumeWindow ?? 30) === w ? styles.rbActive : ""}`}
                      onClick={() => onChange({ volumeWindow: w })}>
                      {w}d
                    </button>
                  ))}
                  <button
                    className={`${styles.rb} ${cfg.trimSpikes !== false ? styles.rbActive : ""}`}
                    title="Exclude days above 3× the median volume"
                    onClick={() => onChange({ trimSpikes: cfg.trimSpikes === false })}>
                    trim spikes
                  </button>
                </div>
                {aprBreakdown && (
                  <span className={styles.fhint}>
                    Basis: {fmtUsd(aprBreakdown.volumeBasisUsd)}/day over {aprBreakdown.volumeWindow}d
                    {aprBreakdown.trimmedDays > 0 && ` · ${aprBreakdown.trimmedDays} spike day${aprBreakdown.trimmedDays > 1 ? "s" : ""} excluded`}
                    {aprBreakdown.fallbackUniform && " · uniform-liquidity estimate (tick data unavailable)"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

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
              <span>{baseSym} {p0}%</span>
              <span>{quoteSym} {p1}%</span>
            </div>
            <div className={styles.splitAmounts}>
              <span>{t0s} {baseSym}
                &nbsp;<span style={{ color: "var(--tm)" }}>≈ {fmtUsd(baseValueUsd)}</span>
              </span>
              <span>{t1s} {quoteSym}
                &nbsp;<span style={{ color: "var(--tm)" }}>≈ {fmtUsd(quoteValueUsd)}</span>
              </span>
            </div>
          </div>

        </div>
      </div>

    </aside>
  );
}
