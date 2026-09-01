import {
  SimulationConfig, SimulationResult, PositionMetrics, AprBreakdown,
  ChartPoint, ScenarioRow, AprHistoryResult, DailyAprSample,
  LiquidityDistribution, DivergenceResult, DivergenceScenario, DlScenarioInput,
  CalcMethod,
} from "./types";
import { SimContext } from "./context";
import {
  getLiquidityFromInvestment, getPositionValueUsd, getAmounts,
  concentratedIL, capitalEfficiency, estimateTotalL, aprFromVolume,
  inRangeProb,
} from "./math";

// ── Core metrics + APR breakdown ──────────────────────────────────────────────
export function computeMetrics(
  cfg: SimulationConfig,
  ctx: SimContext,
): { metrics: PositionMetrics; aprBreakdown: AprBreakdown; calcPrice: number } {
  const pool = ctx.pool;
  const quoteUsd = pool.quoteUsd;
  const price = cfg.currentPrice;

  const L = getLiquidityFromInvestment(cfg.investmentUsd / quoteUsd, price, cfg.lowerPrice, cfg.upperPrice);
  const posValQuote = Math.max(getPositionValueUsd(L, price, cfg.lowerPrice, cfg.upperPrice), 1e-9);
  const posValUsd = posValQuote * quoteUsd;

  // Competing liquidity at the calculation price (Metrix "Calculation Method")
  const method: CalcMethod = cfg.calcMethod ?? "current";
  let totalL = 0;
  let calcPrice = price;
  let fallbackUniform = false;

  if (ctx.curve) {
    const c = ctx.curve, b = ctx.baseToken;
    switch (method) {
      case "peak":
        totalL = c.peakInRange(cfg.lowerPrice, cfg.upperPrice, b);
        calcPrice = peakPriceInRange(ctx, cfg);
        break;
      case "average":
        totalL = c.avgInRange(cfg.lowerPrice, cfg.upperPrice, b);
        calcPrice = Math.sqrt(cfg.lowerPrice * cfg.upperPrice);
        break;
      case "custom":
        calcPrice = cfg.customCalcPrice && cfg.customCalcPrice > 0 ? cfg.customCalcPrice : price;
        totalL = c.activeLAt(calcPrice, b);
        break;
      default:
        totalL = c.activeLAt(price, b);
    }
    if (!(totalL > 0)) fallbackUniform = true;
  } else {
    fallbackUniform = true;
  }
  if (fallbackUniform) {
    totalL = estimateTotalL(pool.tvlUsd / quoteUsd, price);
  }

  const volBasis = ctx.source === "live" ? ctx.volume.avgUsd : cfg.volume24hUsd;
  const apr = aprFromVolume(volBasis, pool.feeTier, L, totalL, posValUsd);
  const daily = posValUsd * apr / 365;

  // Worst case: peak-liquidity competition + weakest recent volume
  const worstL = ctx.curve && !fallbackUniform
    ? Math.max(ctx.curve.peakInRange(cfg.lowerPrice, cfg.upperPrice, ctx.baseToken), totalL)
    : totalL;
  const worstVol = Math.min(ctx.volume.worst7Usd || volBasis, volBasis);
  const worstApr = aprFromVolume(worstVol, pool.feeTier, L, worstL, posValUsd);

  const [baseAmt, quoteAmt] = getAmounts(L, price, cfg.lowerPrice, cfg.upperPrice);
  const baseValueUsd = baseAmt * price * quoteUsd;
  const quoteValueUsd = quoteAmt * quoteUsd;

  const ilLo = concentratedIL(price, cfg.lowerPrice, cfg.lowerPrice, cfg.upperPrice, L);
  const ilHi = concentratedIL(price, cfg.upperPrice, cfg.lowerPrice, cfg.upperPrice, L);
  const worstIl = Math.min(ilLo, ilHi);
  const be = worstIl < 0 && daily > 0 ? Math.abs(worstIl * posValUsd) / daily : Infinity;

  const metrics: PositionMetrics = {
    liquidity: L, baseAmount: baseAmt, quoteAmount: quoteAmt,
    baseValueUsd, quoteValueUsd,
    positionValueUsd: posValUsd, estimatedApr: apr, dailyFeesUsd: daily,
    capitalEfficiency: capitalEfficiency(price, cfg.lowerPrice, cfg.upperPrice),
    ilAtLower: ilLo, ilAtUpper: ilHi,
    breakevenDays: be,
    inRangeProb30d: inRangeProb(price, cfg.lowerPrice, cfg.upperPrice, pool.annualVolatility, 30),
    basePct: posValUsd > 0 ? baseValueUsd / posValUsd : 0.5,
  };

  const aprBreakdown: AprBreakdown = {
    method,
    volumeWindow: ctx.source === "live" ? ctx.volume.window : 0,
    volumeBasisUsd: volBasis,
    trimmedDays: ctx.volume.trimmedDays,
    realisticApr: apr,
    worstCaseApr: worstApr,
    worstCaseVolumeUsd: worstVol,
    fallbackUniform,
  };

  return { metrics, aprBreakdown, calcPrice };
}

function peakPriceInRange(ctx: SimContext, cfg: SimulationConfig): number {
  if (!ctx.curve) return cfg.currentPrice;
  const N = 60;
  let best = cfg.currentPrice, bestL = -1;
  const logLo = Math.log(cfg.lowerPrice), logHi = Math.log(cfg.upperPrice);
  for (let i = 0; i <= N; i++) {
    const p = Math.exp(logLo + (logHi - logLo) * i / N);
    const l = ctx.curve.activeLAt(p, ctx.baseToken);
    if (l > bestL) { bestL = l; best = p; }
  }
  return best;
}

// ── Range chart ───────────────────────────────────────────────────────────────
export function buildRangeChart(cfg: SimulationConfig, m: PositionMetrics): ChartPoint[] {
  const L = m.liquidity;
  const feeRate = m.positionValueUsd > 0 ? m.dailyFeesUsd / m.positionValueUsd : 0;
  const chartMin = cfg.lowerPrice * 0.40;
  const chartMax = cfg.upperPrice * 1.90;
  const N = 300;
  const pts: ChartPoint[] = [];
  for (let i = 0; i < N; i++) {
    const price = chartMin + (chartMax - chartMin) * i / (N - 1);
    const il = concentratedIL(cfg.currentPrice, price, cfg.lowerPrice, cfg.upperPrice, L);
    const inRange = price >= cfg.lowerPrice && price <= cfg.upperPrice;
    const fee30d = inRange ? feeRate * 30 : 0;
    pts.push({ price, ilPct: il * 100, fee30dPct: fee30d * 100, netPnlPct: (il + fee30d) * 100, inRange });
  }
  return pts;
}

// ── Scenario table ────────────────────────────────────────────────────────────
const MULTIPLIERS = [0.40, 0.50, 0.70, 0.85, 1.00, 1.15, 1.30, 1.50, 2.00, 3.00];

export function buildScenarios(cfg: SimulationConfig, ctx: SimContext, m: PositionMetrics): ScenarioRow[] {
  const quoteUsd = ctx.pool.quoteUsd;
  return MULTIPLIERS.map(mul => {
    const price = cfg.currentPrice * mul;
    const posVal = getPositionValueUsd(m.liquidity, price, cfg.lowerPrice, cfg.upperPrice) * quoteUsd;
    const il = concentratedIL(cfg.currentPrice, price, cfg.lowerPrice, cfg.upperPrice, m.liquidity);
    const inRange = price >= cfg.lowerPrice && price <= cfg.upperPrice;
    const fees = inRange ? m.dailyFeesUsd * 30 : 0;
    const ilUsd = Math.abs(Math.min(il, 0)) * posVal;
    const recoveryDays = il >= 0 ? 0 : m.dailyFeesUsd > 0 ? ilUsd / m.dailyFeesUsd : -1;
    return {
      price, priceChangePct: (mul - 1) * 100,
      positionValue: posVal, ilPct: il * 100,
      fees30dUsd: fees, netPnlUsd: posVal - cfg.investmentUsd + fees,
      recoveryDays,
      inRange, isCurrent: Math.abs(mul - 1) < 0.001,
    };
  });
}

// ── APR history ───────────────────────────────────────────────────────────────
export function buildAprHistory(cfg: SimulationConfig, ctx: SimContext, m: PositionMetrics): AprHistoryResult {
  const samples = ctx.source === "live"
    ? liveAprSamples(cfg, ctx, m)
    : presetAprSamples(cfg, ctx);

  const n = Math.max(samples.length, 1);
  const avgApr = samples.reduce((s, x) => s + x.dailyApr, 0) / n;
  const totalWeight = samples.reduce((s, x) => s + x.positionValueUsd, 0);
  const wtdApr = totalWeight > 0
    ? samples.reduce((s, x) => s + x.dailyApr * x.positionValueUsd, 0) / totalWeight
    : 0;

  return { dailySamplesB: samples, averageAprB: avgApr, weightedAprB: wtdApr, daysCounted: samples.length };
}

// Real per-day replay: the configured position against each day's actual close
// price and volume, competing with today's liquidity distribution.
function liveAprSamples(cfg: SimulationConfig, ctx: SimContext, m: PositionMetrics): DailyAprSample[] {
  const pool = ctx.pool;
  const feeRate = pool.feeTier / 1_000_000;
  const quoteUsd = pool.quoteUsd;
  const L = m.liquidity;

  return ctx.tvlDays.map((d, i) => {
    const price = ctx.candles[i]?.close ?? cfg.currentPrice;
    const inRange = price >= cfg.lowerPrice && price <= cfg.upperPrice;
    const posValUsd = Math.max(getPositionValueUsd(L, price, cfg.lowerPrice, cfg.upperPrice) * quoteUsd, 1e-9);
    let feesUsd = 0, dailyApr = 0;
    if (inRange) {
      const activeL = ctx.curve
        ? ctx.curve.activeLAt(price, ctx.baseToken)
        : estimateTotalL(pool.tvlUsd / quoteUsd, price);
      if (activeL + L > 0) {
        feesUsd = d.volumeUsd * feeRate * (L / (activeL + L));
        dailyApr = (feesUsd / posValUsd) * 365;
      }
    }
    return { dayIndex: i, timestampUnix: d.timestampUnix, feesUsd, positionValueUsd: posValUsd, dailyApr, inRange };
  });
}

// Synthetic replay for presets (unchanged seeded behavior)
function presetAprSamples(cfg: SimulationConfig, ctx: SimContext): DailyAprSample[] {
  const pool = ctx.pool;
  const feeRate = pool.feeTier / 1_000_000;
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86_400;
  const DAYS = cfg.days ?? 90;

  let seed = 12345;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };

  const samples: DailyAprSample[] = [];
  let price = cfg.currentPrice;

  for (let i = 0; i < DAYS; i++) {
    price = price * (1 + (lcg() - 0.5) * 0.06);
    const inRange = price >= cfg.lowerPrice && price <= cfg.upperPrice;
    const volScale = 0.7 + lcg() * 0.6;
    const tvlScale = 0.8 + lcg() * 0.4;
    const vol24h = cfg.volume24hUsd * volScale;
    const tvl = pool.tvlUsd * tvlScale;
    const L = getLiquidityFromInvestment(cfg.investmentUsd, price, cfg.lowerPrice, cfg.upperPrice);
    const posVal = Math.max(getPositionValueUsd(L, price, cfg.lowerPrice, cfg.upperPrice), 1e-9);
    const Ltotal = estimateTotalL(tvl, price);
    let feesUsd = 0, dailyApr = 0;
    if (inRange && Ltotal + L > 0) {
      feesUsd = vol24h * feeRate * (L / (Ltotal + L));
      dailyApr = (feesUsd / posVal) * 365;
    }
    samples.push({
      dayIndex: i, timestampUnix: now - (DAYS - 1 - i) * DAY,
      feesUsd, positionValueUsd: posVal, dailyApr, inRange,
    });
  }
  return samples;
}

// ── Liquidity distribution (depth chart) ──────────────────────────────────────
const DEPTH_BUCKETS = 160;

export function buildDistribution(
  cfg: SimulationConfig, ctx: SimContext, calcPrice: number,
): LiquidityDistribution | null {
  if (!ctx.curve) return null;
  return {
    buckets: ctx.curve.buckets(DEPTH_BUCKETS, ctx.baseToken),
    currentPrice: cfg.currentPrice,
    calcPrice,
    clipped: ctx.ticksClipped,
  };
}

// ── Divergence-loss simulation ────────────────────────────────────────────────
const DL_HORIZON_DAYS = 7;

export function buildDivergence(cfg: SimulationConfig, ctx: SimContext, m: PositionMetrics): DivergenceResult {
  const pool = ctx.pool;
  const quoteUsd = pool.quoteUsd;
  const effBaseUsd = cfg.currentPrice * quoteUsd;  // pool-consistent base USD price
  const p0 = cfg.currentPrice;
  const daily = m.dailyFeesUsd;

  const compute = (
    input: DlScenarioInput, label: string, source: DivergenceScenario["source"],
  ): DivergenceScenario => {
    const b = input.basePct, q = input.quotePct;
    const p1 = p0 * (1 + b) / (1 + q);
    const baseUsd1 = effBaseUsd * (1 + b);
    const quoteUsd1 = quoteUsd * (1 + q);
    const [bAmt1, qAmt1] = getAmounts(m.liquidity, p1, cfg.lowerPrice, cfg.upperPrice);
    const posUsd1 = bAmt1 * baseUsd1 + qAmt1 * quoteUsd1;
    const hodlUsd1 = m.baseAmount * baseUsd1 + m.quoteAmount * quoteUsd1;
    const dl = posUsd1 - hodlUsd1;
    const recoveryDays = dl >= -1e-9 ? 0 : daily > 0 ? Math.abs(dl) / daily : -1;
    const verdict: DivergenceScenario["verdict"] =
      recoveryDays < 0 ? "slow" :
      recoveryDays <= DL_HORIZON_DAYS ? "fast" :
      recoveryDays <= DL_HORIZON_DAYS * 2 ? "ok" : "slow";
    return {
      label, source,
      basePct: b, quotePct: q,
      newPrice: p1,
      inRange: p1 >= cfg.lowerPrice && p1 <= cfg.upperPrice,
      positionValueUsd: posUsd1,
      hodlValueUsd: hodlUsd1,
      divergenceLossUsd: dl,
      divergenceLossPct: hodlUsd1 > 0 ? dl / hodlUsd1 : 0,
      recoveryDays,
      verdict,
    };
  };

  const scenarios: DivergenceScenario[] = [];

  // Custom scenarios from the UI
  for (const s of cfg.dlScenarios ?? []) {
    scenarios.push(compute(s, "Custom", "custom"));
  }

  // Historical joint moves (live pools)
  for (const h of ctx.histMoves) {
    scenarios.push(compute({ basePct: h.basePct, quotePct: h.quotePct }, h.label, "historical"));
  }

  // Standard both-direction set by pool type
  const standard: { s: DlScenarioInput; label: string }[] =
    pool.poolType === "stable-stable" ? [
      { s: { basePct: 0.005, quotePct: 0 }, label: "Depeg +0.5%" },
      { s: { basePct: -0.005, quotePct: 0 }, label: "Depeg −0.5%" },
    ] :
    pool.poolType === "crypto-stable" ? [
      { s: { basePct: 0.10, quotePct: 0 }, label: `${pool.baseSymbol} +10%` },
      { s: { basePct: -0.10, quotePct: 0 }, label: `${pool.baseSymbol} −10%` },
      { s: { basePct: 0.25, quotePct: 0 }, label: `${pool.baseSymbol} +25%` },
      { s: { basePct: -0.25, quotePct: 0 }, label: `${pool.baseSymbol} −25%` },
    ] : [
      { s: { basePct: 0.15, quotePct: 0.10 }, label: "Both up +15/+10" },
      { s: { basePct: -0.15, quotePct: -0.10 }, label: "Both down −15/−10" },
      { s: { basePct: 0.10, quotePct: -0.05 }, label: "Diverge +10/−5" },
    ];
  for (const { s, label } of standard) {
    scenarios.push(compute(s, label, "standard"));
  }

  return { poolType: pool.poolType, horizonDays: DL_HORIZON_DAYS, scenarios: scenarios.slice(0, 12) };
}

// ── Full simulation ───────────────────────────────────────────────────────────
export function runSimulation(cfg: SimulationConfig, ctx: SimContext): SimulationResult {
  const { metrics, aprBreakdown, calcPrice } = computeMetrics(cfg, ctx);
  return {
    pool: ctx.pool,
    config: cfg,
    metrics,
    aprBreakdown,
    rangeChart: buildRangeChart(cfg, metrics),
    scenarios: buildScenarios(cfg, ctx, metrics),
    tvlHistory: ctx.tvlDays,
    aprHistory: buildAprHistory(cfg, ctx, metrics),
    priceHistory: ctx.candles,
    liquidity: buildDistribution(cfg, ctx, calcPrice),
    divergence: buildDivergence(cfg, ctx, metrics),
  };
}
