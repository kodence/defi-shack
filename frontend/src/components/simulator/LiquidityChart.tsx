"use client";
import { LiquidityDistribution, SimPoolInfo, SimulationConfig } from "@/types/simulator";
import styles from "./LiquidityChart.module.css";

interface Props {
  data: LiquidityDistribution;
  cfg:  SimulationConfig;
  pool: SimPoolInfo;
}

function fmtP(v: number): string {
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (v >= 1)    return v.toFixed(2);
  return v.toFixed(6);
}

// Real tick-level liquidity around the current price — where your position
// competes for fees (Metrix "depth analysis").
export default function LiquidityChart({ data, cfg, pool }: Props) {
  const { buckets } = data;
  if (!buckets.length) return null;

  const W = 680, H = 180, PL = 12, PR = 4, PT = 14, PB = 22;
  const cW = W - PL - PR, cH = H - PT - PB;

  const pMin = buckets[0].price, pMax = buckets[buckets.length - 1].price;
  if (!(pMin > 0) || !(pMax > pMin)) return null;
  const logMin = Math.log(pMin), logMax = Math.log(pMax);
  const maxL = Math.max(...buckets.map(b => b.activeL), 1e-12);

  const toX = (p: number) => PL + (Math.log(p) - logMin) / (logMax - logMin) * cW;
  const f = (n: number) => n.toFixed(1);
  const barW = cW / buckets.length;

  const clampX = (p: number) => Math.min(Math.max(toX(p), PL), W - PR);
  const loX = clampX(cfg.lowerPrice);
  const hiX = clampX(cfg.upperPrice);
  const curX = clampX(data.currentPrice);
  const calcX = clampX(data.calcPrice);

  // X labels: 5 log-spaced prices
  const xLabels: { x: number; label: string }[] = [];
  for (let i = 0; i <= 4; i++) {
    const p = Math.exp(logMin + (logMax - logMin) * i / 4);
    xLabels.push({ x: toX(p), label: fmtP(p) });
  }

  return (
    <div className={styles.card}>
      <div className={styles.title}>
        Liquidity distribution
        <span className={styles.pill}>
          active liquidity by price{data.clipped ? " · window clipped" : ""}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} style={{ height: H }}>
        {/* In-range shading */}
        <rect x={f(loX)} y={PT} width={f(Math.max(hiX - loX, 0))} height={cH}
          fill="rgba(56,139,253,.08)" />

        {/* Bars */}
        {buckets.map((b, i) => {
          const bH = (b.activeL / maxL) * cH;
          if (bH < 0.3) return null;
          const inRange = b.price >= cfg.lowerPrice && b.price <= cfg.upperPrice;
          return (
            <rect key={i}
              x={f(PL + i * barW)} y={f(PT + cH - bH)}
              width={f(Math.max(barW - 0.4, 0.5))} height={f(bH)}
              fill={inRange ? "rgba(63,185,80,.55)" : "rgba(139,148,158,.35)"} />
          );
        })}

        {/* Range boundaries */}
        <line x1={f(loX)} y1={PT} x2={f(loX)} y2={PT + cH} stroke="#388bfd" strokeWidth="1" strokeDasharray="4 3" />
        <line x1={f(hiX)} y1={PT} x2={f(hiX)} y2={PT + cH} stroke="#388bfd" strokeWidth="1" strokeDasharray="4 3" />

        {/* Calc-method price marker */}
        {Math.abs(calcX - curX) > 2 && (
          <line x1={f(calcX)} y1={PT} x2={f(calcX)} y2={PT + cH}
            stroke="#a371f7" strokeWidth="1.2" strokeDasharray="2 2" />
        )}

        {/* Current price */}
        <line x1={f(curX)} y1={PT - 4} x2={f(curX)} y2={PT + cH}
          stroke="#e3b341" strokeWidth="1.5" strokeDasharray="4 2" />

        {/* X labels */}
        {xLabels.map(({ x, label }) => (
          <text key={label + x} x={f(x)} y={H - 6} fontSize="9" fill="#8b949e" textAnchor="middle">
            {label}
          </text>
        ))}
      </svg>

      <div className={styles.legend}>
        <span className={styles.li}><span className={styles.sw} style={{ background: "rgba(63,185,80,.55)" }} />In your range</span>
        <span className={styles.li}><span className={styles.sw} style={{ background: "rgba(139,148,158,.35)" }} />Outside range</span>
        <span className={styles.li}><span className={styles.ld} style={{ borderColor: "#e3b341" }} />Current price</span>
        <span className={styles.li}><span className={styles.ld} style={{ borderColor: "#a371f7" }} />APR calc price</span>
        <span className={styles.hint}>Price in {pool.quoteSymbol} per {pool.baseSymbol} · log scale</span>
      </div>
    </div>
  );
}
