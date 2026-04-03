"use client";
import { ChartPoint, SimulationConfig } from "@/types/simulator";
import styles from "./RangeChart.module.css";

interface Props {
  data:   ChartPoint[];
  cfg:    SimulationConfig;
}

export default function RangeChart({ data, cfg }: Props) {
  if (!data.length) return null;

  const W = 680, H = 220, PL = 52, PR = 10, PT = 12, PB = 28;
  const cW = W - PL - PR, cH = H - PT - PB;

  const xMin = data[0].price, xMax = data[data.length - 1].price;
  const xR   = xMax - xMin;
  if (xR <= 0) return null;

  const allY  = data.flatMap(d => [d.ilPct, d.netPnlPct]).filter(isFinite);
  const feeYs = data.filter(d => d.inRange && isFinite(d.fee30dPct)).map(d => d.fee30dPct);
  let yMin = allY.length ? Math.min(...allY) * 1.1 : -10;
  let yMax = feeYs.length ? Math.max(...feeYs) * 1.25 : 10;
  yMax = Math.max(yMax, 2); yMin = Math.min(yMin, -2);
  const yR = yMax - yMin;

  const toX = (p: number) => PL + (p - xMin) / xR * cW;
  const toY = (v: number) => PT + (yMax - v) / yR * cH;
  const f   = (n: number) => n.toFixed(1);

  let ilD = "", feeD = "", netD = "";
  let feeOpen = false;
  for (const pt of data) {
    const px = f(toX(pt.price)), iy = f(toY(pt.ilPct)), ny = f(toY(pt.netPnlPct));
    ilD  += (ilD  === "" ? "M" : " L") + `${px},${iy}`;
    netD += (netD === "" ? "M" : " L") + `${px},${ny}`;
    if (pt.inRange && isFinite(pt.fee30dPct)) {
      const fy = f(toY(pt.fee30dPct));
      feeD += (!feeOpen ? "M" : " L") + `${px},${fy}`;
      feeOpen = true;
    }
  }

  const gridLines: { ty: string; label: string }[] = [];
  for (let i = 0; i <= 5; i++) {
    const v = yMin + yR * i / 5;
    gridLines.push({ ty: f(toY(v)), label: `${v.toFixed(1)}%` });
  }

  const xLabels: { px: string; label: string }[] = [];
  for (let i = 0; i <= 6; i++) {
    const xv = xMin + xR * i / 6;
    const px = f(toX(xv));
    const label = xv >= 1000 ? `$${(xv / 1000).toFixed(1)}K` : xv >= 1 ? `$${xv.toFixed(2)}` : `$${xv.toFixed(5)}`;
    xLabels.push({ px, label });
  }

  const sx1 = toX(cfg.lowerPrice), sx2 = toX(cfg.upperPrice);
  const shW = Math.max(0, sx2 - sx1);
  const zeroY = f(toY(0)), cpX = f(toX(cfg.currentPrice));
  const topY  = f(PT), botY = f(PT + cH);

  return (
    <div className={styles.card}>
      <div className={styles.title}>
        Range analysis
        <span className={styles.pill}>IL · Fee · Net PnL vs price</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} style={{ height: H }}>
        {/* Grid lines */}
        {gridLines.map(({ ty, label }) => (
          <g key={ty}>
            <line x1={PL} y1={ty} x2={W - PR} y2={ty} stroke="#21262d" strokeWidth=".5" />
            <text x={PL - 4} y={ty} fontSize="10" fill="#8b949e" textAnchor="end" dominantBaseline="central">{label}</text>
          </g>
        ))}

        {/* Zero line */}
        <line x1={PL} y1={zeroY} x2={W - PR} y2={zeroY} stroke="#484f58" strokeWidth=".8" />

        {/* In-range shading */}
        <rect x={f(sx1)} y={topY} width={f(shW)} height={f(cH)} fill="rgba(63,185,80,.055)" />
        <line x1={f(sx1)} y1={topY} x2={f(sx1)} y2={botY} stroke="rgba(63,185,80,.4)" strokeWidth="1" strokeDasharray="3 3" />
        <line x1={f(sx2)} y1={topY} x2={f(sx2)} y2={botY} stroke="rgba(63,185,80,.4)" strokeWidth="1" strokeDasharray="3 3" />

        {/* IL curve */}
        {ilD  && <path d={ilD}  fill="none" stroke="#f85149" strokeWidth="1.5" strokeLinejoin="round" />}
        {/* Fee curve (in-range only) */}
        {feeD && <path d={feeD} fill="none" stroke="#3fb950" strokeWidth="1.5" strokeLinejoin="round" />}
        {/* Net PnL curve */}
        {netD && <path d={netD} fill="none" stroke="#388bfd" strokeWidth="2"   strokeLinejoin="round" />}

        {/* Current price line */}
        <line x1={cpX} y1={topY} x2={cpX} y2={botY} stroke="#e3b341" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x={(+cpX + 4).toFixed(1)} y={f(PT + 10)} fontSize="10" fill="#e3b341">Current</text>

        {/* X labels */}
        {xLabels.map(({ px, label }) => (
          <text key={px} x={px} y={f(PT + cH + 16)} fontSize="10" fill="#8b949e" textAnchor="middle">{label}</text>
        ))}
      </svg>

      <div className={styles.legend}>
        <span className={styles.li}><span className={styles.ll} style={{ background: "#f85149" }} />Impermanent loss</span>
        <span className={styles.li}><span className={styles.ll} style={{ background: "#3fb950" }} />30d fee (in-range)</span>
        <span className={styles.li}><span className={styles.ll} style={{ background: "#388bfd", height: 3 }} />Net PnL</span>
        <span className={styles.li}><span className={styles.ld} style={{ borderColor: "#e3b341" }} />Current price</span>
        <span className={styles.li}><span className={styles.zone} />In-range zone</span>
      </div>
    </div>
  );
}
