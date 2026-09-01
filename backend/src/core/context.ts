import { STABLECOINS } from "../constants";
import { LivePoolSnapshot } from "../services/poolSnapshot";
import { LiquidityCurve } from "./liquidity";
import { annualizedVolFromCloses, tickToAdjPrice } from "./math";
import {
  PoolPreset, PoolType, PriceCandle, SimPoolInfo, SimulationConfig, TvlDayData,
} from "./types";

export interface HistMove {
  basePct:  number;
  quotePct: number;
  label:    string;
}

export interface SimContext {
  source:       "preset" | "live";
  pool:         SimPoolInfo;
  baseToken:    0 | 1;
  candles:      PriceCandle[];   // oriented, ascending, sliced to cfg.days
  tvlDays:      TvlDayData[];    // aligned with candles
  curve:        LiquidityCurve | null;
  ticksClipped: boolean;
  volume:       { window: number; avgUsd: number; trimmedDays: number; worst7Usd: number };
  histMoves:    HistMove[];
  livePriceO:   number;          // pool's actual current oriented price
}

export function poolTypeOf(baseSymbol: string, quoteSymbol: string): PoolType {
  const b = STABLECOINS.has(baseSymbol);
  const q = STABLECOINS.has(quoteSymbol);
  if (b && q) return "stable-stable";
  if (b || q) return "crypto-stable";
  return "crypto-crypto";
}

export function feeLabelOf(feeTier: number): string {
  return `${feeTier / 10000}%`;
}

// ── Preset context (synthetic history, unchanged behavior) ────────────────────

export function buildPresetContext(cfg: SimulationConfig, preset: PoolPreset): SimContext {
  const days = cfg.days ?? 90;
  const pool: SimPoolInfo = {
    source: "preset",
    id: preset.id,
    name: `${preset.token0Symbol} / ${preset.token1Symbol}`,
    baseSymbol: preset.token0Symbol,
    quoteSymbol: preset.token1Symbol,
    feeTier: preset.feeTier,
    feeLabel: preset.feeLabel,
    tvlUsd: preset.tvlUsd,
    quoteUsd: 1,
    baseUsd: cfg.currentPrice,
    annualVolatility: preset.annualVolatility,
    poolType: poolTypeOf(preset.token0Symbol, preset.token1Symbol),
    invertible: false,
  };

  return {
    source: "preset",
    pool,
    baseToken: 0,
    candles: presetPriceHistory(cfg, preset, days),
    tvlDays: presetTvlHistory(cfg, preset, days),
    curve: null,
    ticksClipped: false,
    volume: { window: 0, avgUsd: cfg.volume24hUsd, trimmedDays: 0, worst7Usd: cfg.volume24hUsd },
    histMoves: [],
    livePriceO: cfg.currentPrice,
  };
}

function presetTvlHistory(cfg: SimulationConfig, preset: PoolPreset, days: number): TvlDayData[] {
  const feeRate = preset.feeTier / 1_000_000;
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86_400;

  let seed = 54321;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };

  const samples: TvlDayData[] = [];
  for (let i = 0; i < days; i++) {
    const tvlUsd = preset.tvlUsd * (0.8 + lcg() * 0.4);
    const volUsd = cfg.volume24hUsd * (0.7 + lcg() * 0.6);
    samples.push({
      dayIndex: i, timestampUnix: now - (days - 1 - i) * DAY,
      tvlUsd, feesUsd: volUsd * feeRate, volumeUsd: volUsd,
    });
  }
  return samples;
}

function presetPriceHistory(cfg: SimulationConfig, preset: PoolPreset, days: number): PriceCandle[] {
  const dailyVol = preset.annualVolatility / Math.sqrt(365);

  let seed = 67890;
  for (let i = 0; i < preset.id.length; i++) seed = (seed * 31 + preset.id.charCodeAt(i)) & 0x7fffffff;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };
  const randn = () => {
    const u1 = Math.max(lcg(), 1e-10), u2 = lcg();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  let price = cfg.currentPrice;
  const prices: number[] = [price];
  for (let i = 1; i < days; i++) {
    price = price / Math.exp(dailyVol * randn());
    prices.unshift(price);
  }

  const candles: PriceCandle[] = [];
  for (let i = 0; i < days; i++) {
    const open = prices[i];
    const close = i < days - 1 ? prices[i + 1] : cfg.currentPrice;
    const spread = Math.abs(open - close) * (0.5 + lcg() * 1.0);
    const high = Math.max(open, close) + spread * (0.3 + lcg() * 0.7);
    const low = Math.min(open, close) - spread * (0.3 + lcg() * 0.7);
    const volume = cfg.volume24hUsd * (0.6 + lcg() * 0.8);
    candles.push({ day: i, open, high, low: Math.max(low, 1e-12), close, volume });
  }
  return candles;
}

// ── Live context (real subgraph data) ─────────────────────────────────────────

export function autoBaseToken(snap: LivePoolSnapshot): 0 | 1 {
  const s0 = STABLECOINS.has(snap.token0.symbol);
  const s1 = STABLECOINS.has(snap.token1.symbol);
  if (s0 && !s1) return 1;   // quote with the stablecoin (token0) → base is token1
  if (s1 && !s0) return 0;
  // Neither/both stable: orient so the price reads ≥ 1
  const pAdj = tickToAdjPrice(snap.tick, snap.token0.decimals, snap.token1.decimals);
  return pAdj >= 1 ? 0 : 1;
}

export function livePriceOriented(snap: LivePoolSnapshot, baseToken: 0 | 1): number {
  const pAdj = tickToAdjPrice(snap.tick, snap.token0.decimals, snap.token1.decimals);
  return baseToken === 0 ? pAdj : 1 / pAdj;
}

export function buildLiveContext(cfg: SimulationConfig, snap: LivePoolSnapshot): SimContext {
  const baseToken = cfg.baseToken ?? autoBaseToken(snap);
  const days = cfg.days ?? 90;
  const base = baseToken === 0 ? snap.token0 : snap.token1;
  const quote = baseToken === 0 ? snap.token1 : snap.token0;
  const priceO = livePriceOriented(snap, baseToken);

  // USD anchors — keep them consistent with the pool's own price
  let quoteUsd = quote.priceUsd;
  let baseUsd = base.priceUsd;
  if (quoteUsd <= 0 && baseUsd > 0 && priceO > 0) quoteUsd = baseUsd / priceO;
  if (quoteUsd <= 0) quoteUsd = 1;
  if (baseUsd <= 0) baseUsd = priceO * quoteUsd;

  // Candles: subgraph OHLC tracks token0Price (token0 per token1) = base-per-quote
  // when token1 is base. Orient so values are quote-per-base.
  const sliced = snap.dayDatas.slice(-days);
  const candles: PriceCandle[] = sliced.map((d, i) => {
    const o = baseToken === 1 ? d : { open: inv(d.open), high: inv(d.low), low: inv(d.high), close: inv(d.close) };
    return {
      day: i, timestampUnix: d.date,
      open: o.open, high: o.high, low: o.low, close: o.close,
      volume: d.volumeUsd,
    };
  });

  const tvlDays: TvlDayData[] = sliced.map((d, i) => ({
    dayIndex: i, timestampUnix: d.date,
    tvlUsd: d.tvlUsd, feesUsd: d.feesUsd, volumeUsd: d.volumeUsd,
  }));

  const curve = snap.ticks.length || snap.liquidityRaw > 0
    ? new LiquidityCurve(
        snap.ticks, snap.tick, snap.liquidityRaw,
        snap.tickWindow.lo, snap.tickWindow.hi,
        snap.token0.decimals, snap.token1.decimals,
        snap.ticksClipped,
      )
    : null;

  const window = cfg.volumeWindow ?? 30;
  const volume = volumeStats(snap.dayDatas, window, cfg.trimSpikes ?? true);

  const pool: SimPoolInfo = {
    source: "live",
    id: snap.poolId,
    network: snap.network,
    networkName: snap.networkName,
    name: `${base.symbol} / ${quote.symbol}`,
    baseSymbol: base.symbol,
    quoteSymbol: quote.symbol,
    feeTier: snap.feeTier,
    feeLabel: feeLabelOf(snap.feeTier),
    tvlUsd: snap.tvlUsd,
    quoteUsd,
    baseUsd,
    annualVolatility: annualizedVolFromCloses(snap.dayDatas.map(d => d.close)),
    poolType: poolTypeOf(base.symbol, quote.symbol),
    invertible: true,
    baseToken,
  };

  return {
    source: "live",
    pool,
    baseToken,
    candles,
    tvlDays,
    curve,
    ticksClipped: snap.ticksClipped,
    volume,
    histMoves: historicalMoves(snap, baseToken),
    livePriceO: priceO,
  };
}

const inv = (v: number) => (v > 0 ? 1 / v : 0);

// Average daily volume over the last `window` complete days, optionally
// excluding spike days (> 3× median) per the "cut unrealistic spikes" guidance.
function volumeStats(
  dayDatas: { date: number; volumeUsd: number }[],
  window: number,
  trim: boolean,
): { window: number; avgUsd: number; trimmedDays: number; worst7Usd: number } {
  const todayStart = Math.floor(Date.now() / 1000 / 86_400) * 86_400;
  const complete = dayDatas.filter(d => d.date < todayStart);

  const avgOf = (n: number, trimmed: boolean): { avg: number; dropped: number } => {
    const vals = complete.slice(-n).map(d => d.volumeUsd).filter(v => v >= 0);
    if (!vals.length) return { avg: 0, dropped: 0 };
    if (!trimmed || vals.length < 4) {
      return { avg: vals.reduce((s, v) => s + v, 0) / vals.length, dropped: 0 };
    }
    const sorted = [...vals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const kept = vals.filter(v => v <= median * 3);
    const dropped = vals.length - kept.length;
    const avg = kept.length ? kept.reduce((s, v) => s + v, 0) / kept.length : 0;
    return { avg, dropped };
  };

  const main = avgOf(window, trim);
  const w7 = avgOf(7, trim);
  return {
    window,
    avgUsd: main.avg,
    trimmedDays: main.dropped,
    worst7Usd: Math.min(w7.avg || main.avg, main.avg || w7.avg),
  };
}

// Largest joint 7-day USD moves of the two tokens (both measured over the SAME
// dates, so each scenario is a move that actually happened).
const MOVE_WINDOW_DAYS = 7;

function historicalMoves(snap: LivePoolSnapshot, baseToken: 0 | 1): HistMove[] {
  const baseDays = baseToken === 0 ? snap.token0Days : snap.token1Days;
  const quoteDays = baseToken === 0 ? snap.token1Days : snap.token0Days;
  const qMap = new Map(quoteDays.map(d => [d.date, d.priceUsd]));
  const span = MOVE_WINDOW_DAYS * 86_400;

  interface Joint { basePct: number; quotePct: number; date: number }
  const joints: Joint[] = [];
  const byDate = new Map(baseDays.map(d => [d.date, d.priceUsd]));
  for (const d of baseDays) {
    const b0 = d.priceUsd, b1 = byDate.get(d.date + span);
    const q0 = qMap.get(d.date), q1 = qMap.get(d.date + span);
    if (!b0 || !b1 || !q0 || !q1) continue;
    joints.push({ basePct: b1 / b0 - 1, quotePct: q1 / q0 - 1, date: d.date });
  }
  if (!joints.length) return [];

  const pick = (fn: (j: Joint) => number, dir: 1 | -1): Joint =>
    joints.reduce((best, j) => (dir * fn(j) > dir * fn(best) ? j : best));

  const candidates = [
    { j: pick(j => j.basePct, 1),  tag: "pump" },
    { j: pick(j => j.basePct, -1), tag: "dump" },
    { j: pick(j => j.quotePct, 1),  tag: "quote pump" },
    { j: pick(j => j.quotePct, -1), tag: "quote dump" },
  ];

  const seen = new Set<number>();
  const out: HistMove[] = [];
  for (const { j, tag } of candidates) {
    if (seen.has(j.date)) continue;
    seen.add(j.date);
    if (Math.abs(j.basePct) < 0.005 && Math.abs(j.quotePct) < 0.005) continue;
    out.push({
      basePct: j.basePct,
      quotePct: j.quotePct,
      label: `Hist. ${MOVE_WINDOW_DAYS}d ${tag}`,
    });
  }
  return out;
}
