import { tickToAdjPrice, adjPriceToTick, MIN_TICK, MAX_TICK } from "./math";
import { LiquidityBucket } from "./types";

export interface TickInfo {
  tickIdx:      number;
  liquidityNet: number;   // raw units (float is fine for analytics precision)
}

interface Segment {
  tickLower: number;
  tickUpper: number;
  activeRaw: number;      // active liquidity across the segment, raw units
}

// Reconstructs the active-liquidity curve inside a tick window without needing
// the full tick list: the pool's current (tick, liquidity) anchors the segment
// containing the current price, and liquidityNet is applied crossing outward.
export class LiquidityCurve {
  private segments: Segment[];
  private scale: number;          // raw → adjusted liquidity divisor
  private dec0: number;
  private dec1: number;
  readonly clipped: boolean;

  constructor(
    ticks: TickInfo[],            // ascending tickIdx, within [windowLo, windowHi]
    currentTick: number,
    activeLiquidityRaw: number,   // pool.liquidity at currentTick
    windowLo: number,
    windowHi: number,
    dec0: number,
    dec1: number,
    clipped = false,
  ) {
    this.dec0 = dec0;
    this.dec1 = dec1;
    this.scale = Math.pow(10, (dec0 + dec1) / 2);
    this.clipped = clipped;

    const lo = Math.max(windowLo, MIN_TICK);
    const hi = Math.min(windowHi, MAX_TICK);
    const inner = ticks.filter(t => t.tickIdx > lo && t.tickIdx < hi);
    const bounds = [lo, ...inner.map(t => t.tickIdx), hi];
    const netAt = new Map(inner.map(t => [t.tickIdx, t.liquidityNet]));

    const segments: Segment[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      segments.push({ tickLower: bounds[i], tickUpper: bounds[i + 1], activeRaw: 0 });
    }

    // Segment containing the current tick (clamped into the window)
    const tc = Math.min(Math.max(currentTick, lo), hi - 1);
    let anchor = segments.findIndex(s => tc >= s.tickLower && tc < s.tickUpper);
    if (anchor < 0) anchor = 0;
    segments[anchor].activeRaw = activeLiquidityRaw;

    // Walk up: crossing a segment's lower boundary tick adds its liquidityNet
    for (let i = anchor + 1; i < segments.length; i++) {
      const net = netAt.get(segments[i].tickLower) ?? 0;
      segments[i].activeRaw = Math.max(0, segments[i - 1].activeRaw + net);
    }
    // Walk down: crossing a segment's upper boundary tick removes its liquidityNet
    for (let i = anchor - 1; i >= 0; i--) {
      const net = netAt.get(segments[i].tickUpper) ?? 0;
      segments[i].activeRaw = Math.max(0, segments[i + 1].activeRaw - net);
    }

    this.segments = segments;
  }

  // Oriented price → canonical adjusted price (token1 per token0)
  private toAdjPrice(priceO: number, baseToken: 0 | 1): number {
    return baseToken === 0 ? priceO : 1 / priceO;
  }

  private segmentAtTick(tick: number): Segment {
    const segs = this.segments;
    const t = Math.min(Math.max(tick, segs[0].tickLower), segs[segs.length - 1].tickUpper - 1);
    // Segments are contiguous; find the last one with tickLower <= t
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].tickLower <= t) lo = mid;
      else hi = mid - 1;
    }
    return segs[lo];
  }

  // Active liquidity (adjusted units) at an oriented price
  activeLAt(priceO: number, baseToken: 0 | 1): number {
    if (priceO <= 0) return 0;
    const tick = adjPriceToTick(this.toAdjPrice(priceO, baseToken), this.dec0, this.dec1);
    return this.segmentAtTick(tick).activeRaw / this.scale;
  }

  // Peak active liquidity (adjusted) across an oriented price range
  peakInRange(loO: number, hiO: number, baseToken: 0 | 1): number {
    const [tA, tB] = this.orientedRangeToTicks(loO, hiO, baseToken);
    let peak = 0;
    for (const s of this.segments) {
      if (s.tickUpper <= tA || s.tickLower >= tB) continue;
      peak = Math.max(peak, s.activeRaw);
    }
    return peak / this.scale;
  }

  // Tick-width-weighted average active liquidity across an oriented price range
  avgInRange(loO: number, hiO: number, baseToken: 0 | 1): number {
    const [tA, tB] = this.orientedRangeToTicks(loO, hiO, baseToken);
    let weighted = 0, width = 0;
    for (const s of this.segments) {
      const a = Math.max(s.tickLower, tA);
      const b = Math.min(s.tickUpper, tB);
      if (b <= a) continue;
      weighted += s.activeRaw * (b - a);
      width += b - a;
    }
    return width > 0 ? weighted / width / this.scale : 0;
  }

  private orientedRangeToTicks(loO: number, hiO: number, baseToken: 0 | 1): [number, number] {
    const pA = this.toAdjPrice(baseToken === 0 ? loO : hiO, baseToken);
    const pB = this.toAdjPrice(baseToken === 0 ? hiO : loO, baseToken);
    // Inverting swaps the ordering; normalize to ascending ticks
    const t1 = adjPriceToTick(Math.min(pA, pB), this.dec0, this.dec1);
    const t2 = adjPriceToTick(Math.max(pA, pB), this.dec0, this.dec1);
    return [t1, Math.max(t2, t1 + 1)];
  }

  // Sampled buckets (ascending oriented price) for the depth chart
  buckets(n: number, baseToken: 0 | 1): LiquidityBucket[] {
    const first = this.segments[0], last = this.segments[this.segments.length - 1];
    const pAdjLo = tickToAdjPrice(first.tickLower, this.dec0, this.dec1);
    const pAdjHi = tickToAdjPrice(last.tickUpper, this.dec0, this.dec1);
    const pLoO = baseToken === 0 ? pAdjLo : 1 / pAdjHi;
    const pHiO = baseToken === 0 ? pAdjHi : 1 / pAdjLo;
    if (!(pLoO > 0) || !(pHiO > pLoO)) return [];

    const out: LiquidityBucket[] = [];
    const logLo = Math.log(pLoO), logHi = Math.log(pHiO);
    for (let i = 0; i < n; i++) {
      const price = Math.exp(logLo + (logHi - logLo) * (i + 0.5) / n);
      out.push({ price, activeL: this.activeLAt(price, baseToken) });
    }
    return out;
  }
}
