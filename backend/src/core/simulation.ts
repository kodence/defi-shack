import {
  SimulationConfig, SimulationResult, PositionMetrics,
  ChartPoint, ScenarioRow, TvlDayData, AprHistoryResult, DailyAprSample,
  PriceCandle,
} from "./types";
import { PRESET_MAP } from "./presets";
import {
  getLiquidityFromInvestment, getPositionValueUsd, getAmounts,
  concentratedIL, capitalEfficiency, estimateTotalL, aprFromVolume,
  inRangeProb, costPerUnitL,
} from "./math";

// ── Core metrics ──────────────────────────────────────────────────────────────
export function computeMetrics(cfg: SimulationConfig): PositionMetrics {
  const preset = PRESET_MAP.get(cfg.presetId)!;
  const L      = getLiquidityFromInvestment(cfg.investmentUsd, cfg.currentPrice, cfg.lowerPrice, cfg.upperPrice);
  const totalL = estimateTotalL(preset.tvlUsd, cfg.currentPrice);
  const posVal = Math.max(getPositionValueUsd(L, cfg.currentPrice, cfg.lowerPrice, cfg.upperPrice), 1e-9);
  const apr    = aprFromVolume(cfg.volume24hUsd, preset.feeTier, L, totalL, posVal);
  const daily  = posVal * apr / 365;
  const [t0, t1] = getAmounts(L, cfg.currentPrice, cfg.lowerPrice, cfg.upperPrice);
  const t0Usd  = t0 * cfg.currentPrice;
  const t1Usd  = t1;
  const ilLo   = concentratedIL(cfg.currentPrice, cfg.lowerPrice, cfg.lowerPrice, cfg.upperPrice, L);
  const ilHi   = concentratedIL(cfg.currentPrice, cfg.upperPrice, cfg.lowerPrice, cfg.upperPrice, L);
  const ce     = capitalEfficiency(cfg.currentPrice, cfg.lowerPrice, cfg.upperPrice);
  const worst  = Math.min(ilLo, ilHi);
  const be     = worst < 0 && daily > 0 ? Math.abs(worst * posVal) / daily : Infinity;
  const prob   = inRangeProb(cfg.currentPrice, cfg.lowerPrice, cfg.upperPrice, preset.annualVolatility, 30);

  return {
    liquidity: L, token0Amount: t0, token1Amount: t1,
    token0ValueUsd: t0Usd, token1ValueUsd: t1Usd,
    positionValueUsd: posVal, estimatedApr: apr, dailyFeesUsd: daily,
    capitalEfficiency: ce, ilAtLower: ilLo, ilAtUpper: ilHi,
    breakevenDays: be, inRangeProb30d: prob,
    token0Pct: posVal > 0 ? t0Usd / posVal : 0.5,
  };
}

// ── Range chart ───────────────────────────────────────────────────────────────
export function buildRangeChart(cfg: SimulationConfig, m: PositionMetrics): ChartPoint[] {
  const L           = m.liquidity;
  const feeRate     = m.positionValueUsd > 0 ? m.dailyFeesUsd / m.positionValueUsd : 0;
  const chartMin    = cfg.lowerPrice * 0.40;
  const chartMax    = cfg.upperPrice * 1.90;
  const N           = 300;
  const pts: ChartPoint[] = [];
  for (let i = 0; i < N; i++) {
    const price   = chartMin + (chartMax - chartMin) * i / (N - 1);
    const il      = concentratedIL(cfg.currentPrice, price, cfg.lowerPrice, cfg.upperPrice, L);
    const inRange = price >= cfg.lowerPrice && price <= cfg.upperPrice;
    const fee30d  = inRange ? feeRate * 30 : 0;
    pts.push({ price, ilPct: il * 100, fee30dPct: fee30d * 100, netPnlPct: (il + fee30d) * 100, inRange });
  }
  return pts;
}

// ── Scenario table ────────────────────────────────────────────────────────────
const MULTIPLIERS = [0.40, 0.50, 0.70, 0.85, 1.00, 1.15, 1.30, 1.50, 2.00, 3.00];

export function buildScenarios(cfg: SimulationConfig, m: PositionMetrics): ScenarioRow[] {
  return MULTIPLIERS.map(mul => {
    const price   = cfg.currentPrice * mul;
    const posVal  = getPositionValueUsd(m.liquidity, price, cfg.lowerPrice, cfg.upperPrice);
    const il      = concentratedIL(cfg.currentPrice, price, cfg.lowerPrice, cfg.upperPrice, m.liquidity);
    const inRange = price >= cfg.lowerPrice && price <= cfg.upperPrice;
    const fees    = inRange ? m.dailyFeesUsd * 30 : 0;
    return {
      price, priceChangePct: (mul - 1) * 100,
      positionValue: posVal, ilPct: il * 100,
      fees30dUsd: fees, netPnlUsd: posVal - cfg.investmentUsd + fees,
      inRange, isCurrent: Math.abs(mul - 1) < 0.001,
    };
  });
}

// ── TVL history (synthetic 30-day) ────────────────────────────────────────────
export function buildTvlHistory(cfg: SimulationConfig): TvlDayData[] {
  const preset  = PRESET_MAP.get(cfg.presetId)!;
  const feeRate = preset.feeTier / 1_000_000;
  const now     = Math.floor(Date.now() / 1000);
  const DAY     = 86_400;

  let seed = 54321;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };

  const samples: TvlDayData[] = [];
  for (let i = 0; i < 30; i++) {
    const tvlScale = 0.8 + lcg() * 0.4;
    const volScale = 0.7 + lcg() * 0.6;
    const tvlUsd   = preset.tvlUsd * tvlScale;
    const volUsd   = cfg.volume24hUsd * volScale;
    const feesUsd  = volUsd * feeRate;
    samples.push({
      dayIndex: i, timestampUnix: now - (29 - i) * DAY,
      tvlUsd, feesUsd, volumeUsd: volUsd,
    });
  }
  return samples;
}

// ── 30-day APR history (Approach B — volume-based) ────────────────────────────
export function buildAprHistory(cfg: SimulationConfig, m: PositionMetrics): AprHistoryResult {
  const preset   = PRESET_MAP.get(cfg.presetId)!;
  const feeRate  = preset.feeTier / 1_000_000;
  const now      = Math.floor(Date.now() / 1000);
  const DAY      = 86_400;

  // Generate 30 synthetic daily samples with ±3% price drift
  let seed = 12345;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };

  const samples: DailyAprSample[] = [];
  let price = cfg.currentPrice;

  for (let i = 0; i < 30; i++) {
    price = price * (1 + (lcg() - 0.5) * 0.06);
    const inRange = price >= cfg.lowerPrice && price <= cfg.upperPrice;
    const volScale = 0.7 + lcg() * 0.6;
    const tvlScale = 0.8 + lcg() * 0.4;
    const vol24h   = cfg.volume24hUsd * volScale;
    const tvl      = preset.tvlUsd * tvlScale;
    const L        = getLiquidityFromInvestment(cfg.investmentUsd, price, cfg.lowerPrice, cfg.upperPrice);
    const posVal   = Math.max(getPositionValueUsd(L, price, cfg.lowerPrice, cfg.upperPrice), 1e-9);
    const Ltotal   = estimateTotalL(tvl, price);
    let feesUsd = 0, dailyApr = 0;
    if (inRange && Ltotal > 0) {
      feesUsd  = vol24h * feeRate * (L / Ltotal);
      dailyApr = (feesUsd / posVal) * 365;
    }
    samples.push({
      dayIndex: i,
      timestampUnix: now - (29 - i) * DAY,
      feesUsd, positionValueUsd: posVal, dailyApr, inRange,
    });
  }

  const n           = samples.length;
  const avgApr      = samples.reduce((s, x) => s + x.dailyApr, 0) / n;
  const totalWeight = samples.reduce((s, x) => s + x.positionValueUsd, 0);
  const wtdApr      = samples.reduce((s, x) => s + x.dailyApr * x.positionValueUsd, 0) / totalWeight;

  return { dailySamplesB: samples, averageAprB: avgApr, weightedAprB: wtdApr, daysCounted: n };
}

// ── Price history (synthetic OHLCV) ───────────────────────────────────────────
export function buildPriceHistory(cfg: SimulationConfig): PriceCandle[] {
  const preset = PRESET_MAP.get(cfg.presetId)!;
  const DAYS   = 90;
  const dailyVol = preset.annualVolatility / Math.sqrt(365);

  // Seeded LCG for reproducibility per preset
  let seed = 67890;
  for (let i = 0; i < preset.id.length; i++) seed = (seed * 31 + preset.id.charCodeAt(i)) & 0x7fffffff;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };
  // Box-Muller for normal distribution
  const randn = () => {
    const u1 = Math.max(lcg(), 1e-10), u2 = lcg();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const candles: PriceCandle[] = [];
  let price = cfg.currentPrice;

  // Walk backwards from current price to generate history, then reverse
  const prices: number[] = [price];
  for (let i = 1; i < DAYS; i++) {
    price = price / Math.exp(dailyVol * randn());
    prices.unshift(price);
  }

  for (let i = 0; i < DAYS; i++) {
    const open  = prices[i];
    const close = i < DAYS - 1 ? prices[i + 1] : cfg.currentPrice;
    // Intraday high/low: spread around open-close range
    const mid   = (open + close) / 2;
    const spread = Math.abs(open - close) * (0.5 + lcg() * 1.0);
    const high  = Math.max(open, close) + spread * (0.3 + lcg() * 0.7);
    const low   = Math.min(open, close) - spread * (0.3 + lcg() * 0.7);
    // Volume: base volume with ±40% variance
    const volume = cfg.volume24hUsd * (0.6 + lcg() * 0.8);

    candles.push({ day: i, open, high, low: Math.max(low, 1e-12), close, volume });
  }

  return candles;
}

// ── Full simulation ───────────────────────────────────────────────────────────
export function runSimulation(cfg: SimulationConfig): SimulationResult {
  const preset  = PRESET_MAP.get(cfg.presetId)!;
  const metrics = computeMetrics(cfg);
  return {
    preset, config: cfg, metrics,
    rangeChart:   buildRangeChart(cfg, metrics),
    scenarios:    buildScenarios(cfg, metrics),
    tvlHistory:   buildTvlHistory(cfg),
    aprHistory:   buildAprHistory(cfg, metrics),
    priceHistory: buildPriceHistory(cfg),
  };
}
