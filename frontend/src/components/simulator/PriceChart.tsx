"use client";
import { useCallback, useRef, useState, useEffect } from "react";
import { PriceCandle, SimulationConfig, TvlDayData, AprHistoryResult } from "@/types/simulator";
import { fmtPrice, fmtUsd } from "@/lib/api";
import styles from "./PriceChart.module.css";

interface Props {
  candles:    PriceCandle[];
  cfg:        SimulationConfig;
  tvlHistory: TvlDayData[];
  aprHistory: AprHistoryResult;
  onChange:   (patch: Partial<SimulationConfig>) => void;
}

type DragTarget = "lower" | "upper" | "current" | null;

interface TooltipInfo {
  x: number;
  y: number;
  lines: string[];
}

/* Overlay label: dark pill with text, positioned inside the chart */
function OverlayLabel({ x, y, label, fontSize = 8, anchor = "start" }: {
  x: string; y: string; label: string; fontSize?: number; anchor?: "start" | "end";
}) {
  const padX = 4, padY = 2, charW = fontSize * 0.58;
  const tw = label.length * charW + padX * 2;
  const th = fontSize + padY * 2;
  const rectX = anchor === "end" ? +x - tw : +x;
  const textX = anchor === "end" ? String(+x - padX) : String(+x + padX);
  return (
    <g>
      <rect x={rectX} y={+y - th / 2} width={tw} height={th} rx="2"
        fill="rgba(13,17,23,.75)" />
      <text x={textX} y={y}
        fontSize={fontSize} fill="#c9d1d9"
        textAnchor={anchor}
        dominantBaseline="central">{label}</text>
    </g>
  );
}

export default function PriceChart({ candles, cfg, tvlHistory, aprHistory, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const dragRef = useRef<DragTarget>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [containerW, setContainerW] = useState(680);

  // ── Measure container width ─────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        // subtract card padding (20px * 2)
        setContainerW(Math.round(e.contentRect.width));
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  if (!candles.length) return null;

  // ── Dimensions — W tracks actual container width ────────────────────────
  const W = containerW, H_PRICE = 300, H_VOL = 75, H_TVL = 75, H_APR = 75, H_GAP = 4, H_SEC_GAP = 10;
  const H = H_PRICE + H_GAP + H_VOL + H_SEC_GAP + H_TVL + H_SEC_GAP + H_APR + 22;
  const PL = 12, PR = 4, PT = 12;
  const priceTop = PT, priceBot = PT + H_PRICE;
  const volTop = priceBot + H_GAP, volBot = volTop + H_VOL;
  const tvlTop = volBot + H_SEC_GAP, tvlBot = tvlTop + H_TVL;
  const aprTop = tvlBot + H_SEC_GAP, aprBot = aprTop + H_APR;
  const cW = W - PL - PR;

  // ── Data ranges ─────────────────────────────────────────────────────────
  const allLows  = candles.map(c => c.low);
  const allHighs = candles.map(c => c.high);
  const pMin = Math.min(...allLows, cfg.lowerPrice) * 0.97;
  const pMax = Math.max(...allHighs, cfg.upperPrice) * 1.03;
  const pR = pMax - pMin;

  const maxVol = Math.max(...candles.map(c => c.volume), 1);
  const N = candles.length;
  const barW = Math.max(1, (cW / N) * 0.65);
  const gap  = (cW - barW * N) / N;

  // TVL / APR sub-chart ranges (last 30 candles aligned)
  const tvlSamples = tvlHistory;
  const aprSamples = aprHistory.dailySamplesB;
  const maxTvl = tvlSamples.length ? Math.max(...tvlSamples.map(d => d.tvlUsd)) * 1.05 : 1;
  const maxApr = aprSamples.length ? Math.max(...aprSamples.map(d => d.dailyApr), 0.01) : 0.01;
  const subOffset = Math.max(0, N - tvlSamples.length);

  // ── Coordinate helpers ──────────────────────────────────────────────────
  const toX = (i: number) => PL + i * (barW + gap) + barW / 2;
  const toY = (price: number) => priceTop + (pMax - price) / pR * H_PRICE;
  const fromY = (y: number) => pMax - (y - priceTop) / H_PRICE * pR;
  const f = (n: number) => n.toFixed(1);

  // ── Price grid lines (labels overlaid inside) ───────────────────────────
  const gridLines: { y: string; label: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const v = pMin + pR * i / 4;
    gridLines.push({ y: f(toY(v)), label: v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(5)}` });
  }

  // ── Axis format helpers ─────────────────────────────────────────────────
  const fmtAxisVal = (v: number) =>
    v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` :
    v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` :
    v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`;

  // ── X labels (every ~15 days) ───────────────────────────────────────────
  const xLabels: { x: string; label: string }[] = [];
  const step = Math.max(1, Math.floor(N / 6));
  for (let i = 0; i < N; i += step) {
    xLabels.push({ x: f(toX(i)), label: `${N - i}d` });
  }
  xLabels.push({ x: f(toX(N - 1)), label: "now" });

  // ── Line Y positions ────────────────────────────────────────────────────
  const lowerY   = toY(cfg.lowerPrice);
  const upperY   = toY(cfg.upperPrice);
  const currentY = toY(cfg.currentPrice);

  // ── Mouse → SVG coordinate conversion (accurate at any scale) ──────────
  const toSvgCoords = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { sx: 0, sy: 0 };
    const rect = svg.getBoundingClientRect();
    // viewBox matches pixel width 1:1 now, so simple ratio works
    const sx = (e.clientX - rect.left) / rect.width * W;
    const sy = (e.clientY - rect.top) / rect.height * H;
    return { sx, sy };
  }, [W, H]);

  const getColFromSvgX = useCallback((sx: number) => {
    const col = Math.round((sx - PL - barW / 2) / (barW + gap));
    return col >= 0 && col < N ? col : -1;
  }, [N, barW, gap]);

  const getSectionFromSvgY = useCallback((sy: number) => {
    if (sy >= priceTop && sy <= priceBot) return "price";
    if (sy >= volTop && sy <= volBot) return "vol";
    if (sy >= tvlTop && sy <= tvlBot) return "tvl";
    if (sy >= aprTop && sy <= aprBot) return "apr";
    return "";
  }, [priceTop, priceBot, volTop, volBot, tvlTop, tvlBot, aprTop, aprBot]);

  // ── Build tooltip lines for a given column + section ────────────────────
  const buildTooltip = useCallback((col: number, section: string): string[] => {
    const c = candles[col];
    const lines: string[] = [];

    if (section === "price" || section === "vol") {
      const up = c.close >= c.open;
      const daysAgo = N - 1 - col;
      const date = new Date(Date.now() - daysAgo * 86_400_000);
      const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      lines.push(`${dateStr} · ${up ? "Up" : "Down"}`);
      lines.push(`O: ${fmtPrice(c.open)}  H: ${fmtPrice(c.high)}`);
      lines.push(`L: ${fmtPrice(c.low)}  C: ${fmtPrice(c.close)}`);
      lines.push(`Vol: ${fmtUsd(c.volume)}`);
    }

    const si = col - subOffset;
    if (si >= 0 && si < tvlSamples.length) {
      if (section === "tvl") {
        const d = tvlSamples[si];
        const date = new Date(d.timestampUnix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        lines.push(date);
        lines.push(`TVL: ${fmtUsd(d.tvlUsd)}`);
        lines.push(`Vol: ${fmtUsd(d.volumeUsd)}`);
        lines.push(`Fees: ${fmtUsd(d.feesUsd)}`);
      }
      if (section === "apr") {
        const s = aprSamples[si];
        if (s) {
          const date = new Date(s.timestampUnix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          lines.push(date);
          lines.push(`APR: ${(s.dailyApr * 100).toFixed(2)}%`);
          lines.push(`Fees: ${fmtUsd(s.feesUsd)}`);
          lines.push(s.inRange ? "In range" : "Out of range");
        }
      }
    }

    return lines;
  }, [candles, tvlSamples, aprSamples, N, subOffset]);

  // ── Mouse interaction for dragging lines ────────────────────────────────
  const HIT_ZONE = 8;

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const { sy } = toSvgCoords(e);
    const distLower   = Math.abs(sy - lowerY);
    const distUpper   = Math.abs(sy - upperY);
    const distCurrent = Math.abs(sy - currentY);
    const minDist     = Math.min(distLower, distUpper, distCurrent);

    if (minDist >= HIT_ZONE) return;

    if (minDist === distCurrent) {
      dragRef.current = "current";
      setDragging("current");
    } else if (minDist === distLower) {
      dragRef.current = "lower";
      setDragging("lower");
    } else {
      dragRef.current = "upper";
      setDragging("upper");
    }
    e.preventDefault();
  }, [toSvgCoords, lowerY, upperY, currentY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const { sx, sy } = toSvgCoords(e);

    // ── Dragging ──
    if (dragRef.current) {
      setTooltip(null);
      const price = fromY(Math.max(priceTop, Math.min(priceBot, sy)));
      if (price <= 0) return;

      if (dragRef.current === "lower") {
        if (price < cfg.upperPrice) onChange({ lowerPrice: price });
      } else if (dragRef.current === "upper") {
        if (price > cfg.lowerPrice) onChange({ upperPrice: price });
      } else {
        onChange({ currentPrice: price });
      }
      return;
    }

    // ── Tooltip ──
    const col = getColFromSvgX(sx);
    const section = getSectionFromSvgY(sy);
    if (col < 0 || !section) { setTooltip(null); return; }

    const wrap = wrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const lines = buildTooltip(col, section);
    if (!lines.length) { setTooltip(null); return; }

    setTooltip({
      x: e.clientX - wrapRect.left + 14,
      y: e.clientY - wrapRect.top - 10,
      lines,
    });
  }, [toSvgCoords, getColFromSvgX, getSectionFromSvgY, buildTooltip,
      cfg.lowerPrice, cfg.upperPrice, onChange, priceTop, priceBot]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    setDragging(null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      setDragging(null);
    }
    setTooltip(null);
  }, []);

  const getCursor = () => {
    if (dragging) return "ns-resize";
    return "crosshair";
  };

  return (
    <div className={styles.card} ref={wrapRef} style={{ position: "relative" }}>
      <div className={styles.title}>
        Price chart
        <span className={styles.pill}>{cfg.days ?? 90}-day synthetic · OHLCV</span>
        <span className={styles.daySelector}>
          {[7, 30, 90, 365].map(d => (
            <button
              key={d}
              className={`${styles.dayBtn} ${(cfg.days ?? 90) === d ? styles.dayBtnActive : ""}`}
              onClick={() => onChange({ days: d })}
            >
              {d}d
            </button>
          ))}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={styles.svg}
        style={{ width: "100%", height: H, cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Price grid lines */}
        {gridLines.map(({ y }) => (
          <line key={y} x1={PL} y1={y} x2={W - PR} y2={y} stroke="#21262d" strokeWidth=".5" />
        ))}

        {/* In-range shading */}
        <rect
          x={PL} y={f(Math.min(upperY, lowerY))}
          width={cW} height={f(Math.abs(lowerY - upperY))}
          fill="rgba(56,139,253,.08)"
        />

        {/* Candlesticks */}
        {candles.map((c, i) => {
          const cx = toX(i);
          const up = c.close >= c.open;
          const color = up ? "#3fb950" : "#f85149";
          const bodyTop = toY(Math.max(c.open, c.close));
          const bodyBot = toY(Math.min(c.open, c.close));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          const wickTop = toY(c.high);
          const wickBot = toY(c.low);

          return (
            <g key={i}>
              <line x1={f(cx)} y1={f(wickTop)} x2={f(cx)} y2={f(wickBot)} stroke={color} strokeWidth="0.8" />
              <rect
                x={f(cx - barW / 2)} y={f(bodyTop)}
                width={f(barW)} height={f(bodyH)}
                fill={up ? "transparent" : color}
                stroke={color} strokeWidth="0.8"
              />
            </g>
          );
        })}

        {/* Price grid labels (overlaid inside chart, left edge) */}
        {gridLines.map(({ y, label }) => (
          <OverlayLabel key={y} x={f(PL + 2)} y={y} label={label} />
        ))}

        {/* Price grid labels (right edge) */}
        {gridLines.map(({ y, label }) => (
          <OverlayLabel key={`r${y}`} x={f(W - PR - 2)} y={y} label={label} anchor="end" />
        ))}

        {/* ── Volume section ─────────────────────────────────────────── */}
        <line x1={PL} y1={volTop - 2} x2={W - PR} y2={volTop - 2} stroke="#21262d" strokeWidth=".5" />

        {candles.map((c, i) => {
          const cx = toX(i);
          const up = c.close >= c.open;
          const vH = (c.volume / maxVol) * H_VOL;
          return (
            <rect
              key={i}
              x={f(cx - barW / 2)} y={f(volBot - vH)}
              width={f(barW)} height={f(Math.max(0.5, vH))}
              fill={up ? "rgba(63,185,80,.4)" : "rgba(248,81,73,.4)"}
            />
          );
        })}

        {/* Vol section label */}
        <OverlayLabel x={f(PL + 2)} y={f(volTop + 9)} label="Vol" />

        {/* ── TVL section ────────────────────────────────────────────── */}
        <line x1={PL} y1={f(volBot + H_SEC_GAP / 2)} x2={W - PR} y2={f(volBot + H_SEC_GAP / 2)} stroke="#484f58" strokeWidth="1" />

        {tvlSamples.map((d, i) => {
          const ci = subOffset + i;
          const cx = toX(ci);
          const bH = (d.tvlUsd / maxTvl) * H_TVL;
          return (
            <rect key={i} x={f(cx - barW / 2)} y={f(tvlBot - bH)}
              width={f(barW)} height={f(Math.max(0.5, bH))}
              fill="rgba(56,139,253,.55)" rx="0.5" />
          );
        })}

        {/* TVL section label + scale */}
        <OverlayLabel x={f(PL + 2)} y={f(tvlTop + 9)} label={`TVL  ${fmtAxisVal(maxTvl)}`} />

        {/* ── APR section ────────────────────────────────────────────── */}
        <line x1={PL} y1={f(tvlBot + H_SEC_GAP / 2)} x2={W - PR} y2={f(tvlBot + H_SEC_GAP / 2)} stroke="#484f58" strokeWidth="1" />

        {aprSamples.map((s, i) => {
          const ci = subOffset + i;
          const cx = toX(ci);
          const bH = maxApr > 0 ? (s.dailyApr / maxApr) * H_APR : 0;
          const fill = s.inRange ? "#3fb950" : "#30363d";
          return (
            <rect key={i} x={f(cx - barW / 2)} y={f(aprBot - bH)}
              width={f(barW)} height={f(Math.max(0.5, bH))}
              fill={fill} rx="0.5" opacity={s.inRange ? 0.85 : 0.4} />
          );
        })}

        {/* APR section label + scale */}
        <OverlayLabel x={f(PL + 2)} y={f(aprTop + 9)} label={`APR  ${(maxApr * 100).toFixed(0)}%`} />

        {/* Lower price line (draggable) */}
        <line
          x1={PL} y1={f(lowerY)} x2={W - PR} y2={f(lowerY)}
          stroke="#388bfd" strokeWidth={dragging === "lower" ? "2.5" : "1.5"}
          strokeDasharray="6 3" opacity={dragging === "lower" ? 1 : 0.8}
        />
        <rect
          x={PL} y={f(lowerY - HIT_ZONE)} width={cW} height={HIT_ZONE * 2}
          fill="transparent" style={{ cursor: "ns-resize" }}
        />
        <rect x={f(W - PR - 70)} y={f(lowerY - 8)} width="70" height="16" rx="3" fill="#388bfd" opacity=".9" />
        <text x={f(W - PR - 35)} y={f(lowerY + 1)} fontSize="9" fill="#fff" textAnchor="middle" dominantBaseline="central" fontWeight="600">
          Min {fmtPrice(cfg.lowerPrice)}
        </text>

        {/* Upper price line (draggable) */}
        <line
          x1={PL} y1={f(upperY)} x2={W - PR} y2={f(upperY)}
          stroke="#388bfd" strokeWidth={dragging === "upper" ? "2.5" : "1.5"}
          strokeDasharray="6 3" opacity={dragging === "upper" ? 1 : 0.8}
        />
        <rect
          x={PL} y={f(upperY - HIT_ZONE)} width={cW} height={HIT_ZONE * 2}
          fill="transparent" style={{ cursor: "ns-resize" }}
        />
        <rect x={f(W - PR - 70)} y={f(upperY - 8)} width="70" height="16" rx="3" fill="#388bfd" opacity=".9" />
        <text x={f(W - PR - 35)} y={f(upperY + 1)} fontSize="9" fill="#fff" textAnchor="middle" dominantBaseline="central" fontWeight="600">
          Max {fmtPrice(cfg.upperPrice)}
        </text>

        {/* Current price line (draggable) */}
        <line
          x1={PL} y1={f(currentY)} x2={W - PR} y2={f(currentY)}
          stroke="#e3b341" strokeWidth={dragging === "current" ? "2.5" : "1.5"}
          strokeDasharray="4 2" opacity={dragging === "current" ? 1 : 0.8}
        />
        <rect
          x={PL} y={f(currentY - HIT_ZONE)} width={cW} height={HIT_ZONE * 2}
          fill="transparent" style={{ cursor: "ns-resize" }}
        />
        <rect x={PL} y={f(currentY - 8)} width="74" height="16" rx="3" fill="#e3b341" opacity=".9" />
        <text x={f(PL + 37)} y={f(currentY + 1)} fontSize="9" fill="#000" textAnchor="middle" dominantBaseline="central" fontWeight="600">
          Now {fmtPrice(cfg.currentPrice)}
        </text>

        {/* X-axis labels */}
        {xLabels.map(({ x, label }) => (
          <text key={x + label} x={x} y={f(aprBot + 14)} fontSize="9" fill="#8b949e" textAnchor="middle">{label}</text>
        ))}
      </svg>

      {/* HTML Tooltip */}
      {tooltip && (
        <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      <div className={styles.legend}>
        <span className={styles.li}><span className={styles.ll} style={{ background: "#3fb950" }} />Up candle</span>
        <span className={styles.li}><span className={styles.ll} style={{ background: "#f85149" }} />Down candle</span>
        <span className={styles.li}><span className={styles.ll} style={{ background: "#388bfd" }} />TVL</span>
        <span className={styles.li}><span className={styles.ll} style={{ background: "#3fb950", opacity: 0.6 }} />APR</span>
        <span className={styles.li}><span className={styles.ld} style={{ borderColor: "#388bfd" }} />Price range</span>
        <span className={styles.li}><span className={styles.ld} style={{ borderColor: "#e3b341" }} />Current price</span>
        <span className={styles.li}><span className={styles.rangeFill} />In-range zone</span>
        <span className={styles.dragHint}>Drag lines to adjust</span>
      </div>
    </div>
  );
}
