import { Normal } from "./normal";

// ── Constants ─────────────────────────────────────────────────────────────────
const Q128 = BigInt("340282366920938463463374607431768211456"); // 2^128
const UINT256_MOD = BigInt(2) ** BigInt(256);

// ── Tick ↔ Price ──────────────────────────────────────────────────────────────
export const tickToPrice  = (tick: number): number => Math.pow(1.0001, tick);
export const priceToTick  = (price: number): number =>
  Math.floor(Math.log(price) / Math.log(1.0001));

export const MIN_TICK = -887272;
export const MAX_TICK =  887272;

// Adjusted (human) price P = token1 per token0. Raw on-chain price differs by
// a 10^(dec1-dec0) factor, so tick = log_1.0001(P · 10^(dec1-dec0)).
export const adjPriceToTick = (price: number, dec0: number, dec1: number): number =>
  priceToTick(price * Math.pow(10, dec1 - dec0));
export const tickToAdjPrice = (tick: number, dec0: number, dec1: number): number =>
  tickToPrice(tick) * Math.pow(10, dec0 - dec1);

// ── BigInt helpers ────────────────────────────────────────────────────────────
export const uint256Delta = (end: bigint, start: bigint): bigint =>
  ((end - start) + UINT256_MOD) % UINT256_MOD;

export const rawTokensFromDelta = (L: bigint, delta: bigint): bigint =>
  (L * delta) / Q128;

// ── Token amounts from liquidity ──────────────────────────────────────────────
export function getAmounts(
  liquidity: number,
  price:     number,
  loPx:      number,
  hiPx:      number,
): [number, number] {
  if (liquidity <= 0 || loPx <= 0 || hiPx <= loPx) return [0, 0];
  const sp  = Math.sqrt(price);
  const spa = Math.sqrt(loPx);
  const spb = Math.sqrt(hiPx);
  if (price <= loPx) return [liquidity * (1 / spa - 1 / spb), 0];
  if (price >= hiPx) return [0, liquidity * (spb - spa)];
  return [liquidity * (1 / sp - 1 / spb), liquidity * (sp - spa)];
}

// ── Cost per unit liquidity ───────────────────────────────────────────────────
export function costPerUnitL(price: number, loPx: number, hiPx: number): number {
  if (price <= 0 || loPx <= 0 || hiPx <= loPx) return 0;
  const sp = Math.sqrt(price), spa = Math.sqrt(loPx), spb = Math.sqrt(hiPx);
  if (price <= loPx) return price * (1 / spa - 1 / spb);
  if (price >= hiPx) return spb - spa;
  return (1 / sp - 1 / spb) * price + (sp - spa);
}

export function getLiquidityFromInvestment(
  usd: number, price: number, loPx: number, hiPx: number,
): number {
  const c = costPerUnitL(price, loPx, hiPx);
  return c > 0 ? usd / c : 0;
}

export function getPositionValueUsd(
  L: number, price: number, loPx: number, hiPx: number,
): number {
  const [t0, t1] = getAmounts(L, price, loPx, hiPx);
  return t0 * price + t1;
}

// ── Impermanent loss ──────────────────────────────────────────────────────────
export function concentratedIL(
  entryPrice: number, currentPrice: number,
  loPx: number,  hiPx: number,  L: number,
): number {
  if (L <= 0) return 0;
  const [t0e, t1e] = getAmounts(L, entryPrice, loPx, hiPx);
  const lpVal   = getPositionValueUsd(L, currentPrice, loPx, hiPx);
  const holdVal = t0e * currentPrice + t1e;
  return holdVal > 0 ? (lpVal - holdVal) / holdVal : 0;
}

// ── Capital efficiency ────────────────────────────────────────────────────────
export function capitalEfficiency(price: number, loPx: number, hiPx: number): number {
  const cc = costPerUnitL(price, loPx, hiPx);
  const cf = costPerUnitL(price, price * 0.001, price * 1000);
  return cc > 0 ? cf / cc : 1;
}

// ── Estimate total pool liquidity from TVL ────────────────────────────────────
export function estimateTotalL(tvlUsd: number, price: number, rangePct = 0.25): number {
  const c = costPerUnitL(price, price * (1 - rangePct), price * (1 + rangePct));
  return c > 0 ? tvlUsd / c : tvlUsd;
}

// ── Volume-based APR ──────────────────────────────────────────────────────────
// Ltotal is the competing liquidity at the calculation price; the position's own
// liquidity is added to the denominator so large deposits visibly dilute APR.
export function aprFromVolume(
  vol24h: number, feeTier: number,
  Lpos: number, Ltotal: number, posVal: number,
): number {
  if (posVal <= 0 || Ltotal + Lpos <= 0) return 0;
  return (vol24h * (feeTier / 1e6) * (Lpos / (Ltotal + Lpos)) / posVal) * 365;
}

// ── Annualized volatility from daily closes (stddev of log returns) ───────────
export function annualizedVolFromCloses(closes: number[], fallback = 0.8): number {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 7) return fallback;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const varr = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(varr) * Math.sqrt(365);
}

// ── GBM in-range probability ──────────────────────────────────────────────────
export function inRangeProb(
  price: number, loPx: number, hiPx: number,
  sigma = 0.80, days = 30,
): number {
  if (price <= 0 || loPx <= 0 || hiPx <= loPx) return 0;
  const t   = days / 365;
  const std = sigma * Math.sqrt(t);
  if (std <= 0) return 1;
  const drift = -0.5 * sigma ** 2 * t;
  const zLow  = (Math.log(loPx / price) - drift) / std;
  const zHigh = (Math.log(hiPx / price) - drift) / std;
  return Normal.cdf(zHigh) - Normal.cdf(zLow);
}
