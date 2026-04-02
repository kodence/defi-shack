"use client";
import { useCallback, useRef, useState } from "react";
import { PriceCandle, SimulationConfig } from "@/types/simulator";
import { fmtPrice } from "@/lib/api";
import styles from "./PriceChart.module.css";

interface Props {
  candles:  PriceCandle[];
  cfg:      SimulationConfig;
  onChange: (patch: Partial<SimulationConfig>) => void;
}

type DragTarget = "lower" | "upper" | "current" | null;

export default function PriceChart({ candles, cfg, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const dragRef = useRef<DragTarget>(null);

  if (!candles.length) return null;

  // ── Dimensions ──────────────────────────────────────────────────────────
  const W = 420, H_PRICE = 170, H_VOL = 40, H_GAP = 6;
  const H = H_PRICE + H_GAP + H_VOL + 28; // +28 for x-labels
  const PL = 56, PR = 10, PT = 12, PB = 28;
  const priceTop = PT, priceBot = PT + H_PRICE;
  const volTop = priceBot + H_GAP, volBot = volTop + H_VOL;
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

  // ── Coordinate helpers ──────────────────────────────────────────────────
  const toX = (i: number) => PL + i * (barW + gap) + barW / 2;
  const toY = (price: number) => priceTop + (pMax - price) / pR * H_PRICE;
  const fromY = (y: number) => pMax - (y - priceTop) / H_PRICE * pR;
  const toVolY = (v: number) => volBot - (v / maxVol) * H_VOL;
  const f = (n: number) => n.toFixed(1);

  // ── Price grid lines ────────────────────────────────────────────────────
  const gridLines: { y: string; label: string }[] = [];
  for (let i = 0; i <= 4; i++) {
    const v = pMin + pR * i / 4;
    gridLines.push({ y: f(toY(v)), label: v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(5)}` });
  }

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

  // ── Mouse interaction for dragging lines ────────────────────────────────
  const getYFromEvent = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const clientY = e.clientY - rect.top;
    return clientY / rect.height * (H);
  }, [H]);

  const HIT_ZONE = 8; // px tolerance for grabbing a line

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const y = getYFromEvent(e);
    const distLower   = Math.abs(y - lowerY);
    const distUpper   = Math.abs(y - upperY);
    const distCurrent = Math.abs(y - currentY);
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
  }, [getYFromEvent, lowerY, upperY, currentY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const y = getYFromEvent(e);
    const price = fromY(Math.max(priceTop, Math.min(priceBot, y)));
    if (price <= 0) return;

    if (dragRef.current === "lower") {
      if (price < cfg.upperPrice) onChange({ lowerPrice: price });
    } else if (dragRef.current === "upper") {
      if (price > cfg.lowerPrice) onChange({ upperPrice: price });
    } else {
      onChange({ currentPrice: price });
    }
  }, [getYFromEvent, cfg.lowerPrice, cfg.upperPrice, onChange, priceTop, priceBot]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    setDragging(null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      setDragging(null);
    }
  }, []);

  // ── Cursor style based on hover position ────────────────────────────────
  const getCursor = () => {
    if (dragging) return "ns-resize";
    return "crosshair";
  };

  return (
    <div className={styles.card}>
      <div className={styles.title}>
        Price chart
        <span className={styles.pill}>90-day synthetic · OHLCV</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        style={{ height: H, cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Price grid */}
        {gridLines.map(({ y, label }) => (
          <g key={y}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#21262d" strokeWidth=".5" />
            <text x={PL - 4} y={y} fontSize="9" fill="#484f58" textAnchor="end" dominantBaseline="central">{label}</text>
          </g>
        ))}

        {/* In-range shading between the two lines */}
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
              {/* Wick */}
              <line x1={f(cx)} y1={f(wickTop)} x2={f(cx)} y2={f(wickBot)} stroke={color} strokeWidth="0.8" />
              {/* Body */}
              <rect
                x={f(cx - barW / 2)} y={f(bodyTop)}
                width={f(barW)} height={f(bodyH)}
                fill={up ? "transparent" : color}
                stroke={color} strokeWidth="0.8"
              />
            </g>
          );
        })}

        {/* Volume separator line */}
        <line x1={PL} y1={volTop - 2} x2={W - PR} y2={volTop - 2} stroke="#21262d" strokeWidth=".5" />

        {/* Volume bars */}
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
        {/* Lower label */}
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
        {/* Upper label */}
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
        {/* Current price label */}
        <rect x={PL} y={f(currentY - 8)} width="74" height="16" rx="3" fill="#e3b341" opacity=".9" />
        <text x={f(PL + 37)} y={f(currentY + 1)} fontSize="9" fill="#000" textAnchor="middle" dominantBaseline="central" fontWeight="600">
          Now {fmtPrice(cfg.currentPrice)}
        </text>

        {/* X-axis labels */}
        {xLabels.map(({ x, label }) => (
          <text key={x + label} x={x} y={f(volBot + 14)} fontSize="9" fill="#484f58" textAnchor="middle">{label}</text>
        ))}
      </svg>

      <div className={styles.legend}>
        <span className={styles.li}><span className={styles.ll} style={{ background: "#3fb950" }} />Up candle</span>
        <span className={styles.li}><span className={styles.ll} style={{ background: "#f85149" }} />Down candle</span>
        <span className={styles.li}><span className={styles.ld} style={{ borderColor: "#388bfd" }} />Price range</span>
        <span className={styles.li}><span className={styles.ld} style={{ borderColor: "#e3b341" }} />Current price</span>
        <span className={styles.li}><span className={styles.rangeFill} />In-range zone</span>
        <span className={styles.dragHint}>Drag lines to adjust</span>
      </div>
    </div>
  );
}
