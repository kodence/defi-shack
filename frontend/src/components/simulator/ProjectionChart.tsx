"use client";
import { ProjectionPoint, PositionMetrics } from "@/types/simulator";
import { fmtUsd } from "@/lib/api";
import styles from "./ProjectionChart.module.css";

interface Props { pts: ProjectionPoint[]; metrics: PositionMetrics; days: number; }

export default function ProjectionChart({ pts, metrics, days }: Props) {
  if (pts.length < 2) return null;

  const W = 440, H = 165, PL = 56, PR = 10, PT = 10, PB = 26;
  const cW = W - PL - PR, cH = H - PT - PB;

  const totalFees = pts[pts.length - 1].cumulativeFeesUsd;
  const xMax      = pts[pts.length - 1].day;
  const yMax      = Math.max(totalFees * 1.05, 1e-9);

  const toX = (d: number)   => PL + d / xMax * cW;
  const toY = (usd: number) => PT + (1 - usd / yMax) * cH;
  const f   = (n: number)   => n.toFixed(1);

  const gridLines: { ty: string; label: string }[] = [];
  for (let i = 0; i <= 4; i++) {
    const v = yMax * i / 4;
    const ty = f(toY(v));
    const label = v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v.toFixed(0)}`;
    gridLines.push({ ty, label });
  }

  let linePath = "", areaPath = "";
  for (const pt of pts) {
    const px = f(toX(pt.day)), py = f(toY(pt.cumulativeFeesUsd));
    linePath  += (linePath  === "" ? "M" : " L") + `${px},${py}`;
    areaPath  += (areaPath  === "" ? "M" : " L") + `${px},${py}`;
  }
  areaPath += ` L${f(toX(xMax))},${f(PT + cH)} L${PL},${f(PT + cH)} Z`;

  const xLabels = Array.from({ length: 5 }, (_, i) => {
    const d = xMax * i / 4;
    return { px: f(toX(d)), label: `${Math.round(d)}d` };
  });

  return (
    <div className={styles.card}>
      <div className={styles.title}>
        Fee projection
        <span className={styles.pill}>{days}-day horizon</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} style={{ height: H }}>
        <defs>
          <linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#3fb950" stopOpacity=".28" />
            <stop offset="100%" stopColor="#3fb950" stopOpacity=".02" />
          </linearGradient>
        </defs>

        {gridLines.map(({ ty, label }) => (
          <g key={ty}>
            <line x1={PL} y1={ty} x2={W - PR} y2={ty} stroke="#21262d" strokeWidth=".5" />
            <text x={PL - 4} y={ty} fontSize="10" fill="#484f58" textAnchor="end" dominantBaseline="central">{label}</text>
          </g>
        ))}

        <path d={areaPath} fill="url(#feeGrad)" />
        <path d={linePath} fill="none" stroke="#3fb950" strokeWidth="2" strokeLinejoin="round" />

        {xLabels.map(({ px, label }) => (
          <text key={px} x={px} y={f(PT + cH + 16)} fontSize="10" fill="#484f58" textAnchor="middle">{label}</text>
        ))}
      </svg>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statVal}>{fmtUsd(totalFees)}</div>
          <div className={styles.statLbl}>Total projected fees</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal}>{fmtUsd(metrics.dailyFeesUsd)}</div>
          <div className={styles.statLbl}>Daily rate</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal}>{(metrics.estimatedApr * 100 / 12).toFixed(2)}%</div>
          <div className={styles.statLbl}>Monthly APR equiv.</div>
        </div>
      </div>
    </div>
  );
}
