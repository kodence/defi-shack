import { ACTIVE_BAND_PCT } from "../constants";
import { SubgraphPool, SubgraphTickLite } from "../types/subgraph";

// Reconstructs what a pool's liquidity providers actually hold.
//
// The subgraph's totalValueLocked* fields drift far above reality (measured
// 2.3x on WETH/USDT 0.3% and 11.2x on USDC/WETH 0.3%), so pool TVL is rebuilt
// from tick liquidity instead. Walking liquidityNet outward from the current
// tick -- anchored on pool.liquidity -- gives the active liquidity of every
// tick range, and each range's liquidity implies exactly the token amounts it
// holds. Summing their value reproduces the real TVL.

export interface PoolLiquidityStats {
  tvlUsd: number;        // value held across every tick range
  activeTvlUsd: number;  // value within ACTIVE_BAND_PCT of spot
  priceToken1PerToken0: number;
}

const sqrtRatio = (tick: number): number => Math.pow(1.0001, tick / 2);

export function computePoolLiquidity(
  pool: SubgraphPool,
  rawTicks: SubgraphTickLite[],
  ethPriceUsd: number
): PoolLiquidityStats | null {
  if (pool.tick === null || rawTicks.length < 2) return null;

  const current = parseInt(pool.tick, 10);
  const activeLiquidity = parseFloat(pool.liquidity);
  const dec0 = parseInt(pool.token0.decimals, 10);
  const dec1 = parseInt(pool.token1.decimals, 10);
  const price0 = parseFloat(pool.token0.derivedETH) * ethPriceUsd;
  const price1 = parseFloat(pool.token1.derivedETH) * ethPriceUsd;
  if (!isFinite(activeLiquidity) || (price0 <= 0 && price1 <= 0)) return null;

  const ticks = rawTicks
    .map((t) => ({ idx: parseInt(t.tickIdx, 10), net: parseFloat(t.liquidityNet) }))
    .sort((a, b) => a.idx - b.idx);

  const netAt = new Map(ticks.map((t) => [t.idx, t.net]));
  const bounds = ticks.map((t) => t.idx);

  // One segment per gap between initialized ticks, each with its active liquidity
  const segments: { lower: number; upper: number; liquidity: number }[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    segments.push({ lower: bounds[i], upper: bounds[i + 1], liquidity: 0 });
  }
  const anchor = segments.findIndex((s) => current >= s.lower && current < s.upper);
  if (anchor < 0) return null;   // spot sits outside the initialized range

  segments[anchor].liquidity = activeLiquidity;
  for (let i = anchor + 1; i < segments.length; i++) {
    segments[i].liquidity = Math.max(
      0, segments[i - 1].liquidity + (netAt.get(segments[i].lower) ?? 0)
    );
  }
  for (let i = anchor - 1; i >= 0; i--) {
    segments[i].liquidity = Math.max(
      0, segments[i + 1].liquidity - (netAt.get(segments[i].upper) ?? 0)
    );
  }

  const sqrtCurrent = sqrtRatio(current);

  // Liquidity L spanning [tl, tu) holds token0 above spot and token1 below it;
  // the segment containing spot holds both.
  const segmentUsd = (tl: number, tu: number, liquidity: number): number => {
    if (liquidity <= 0 || tu <= tl) return 0;
    const lo = sqrtRatio(tl);
    const hi = sqrtRatio(tu);
    let amount0 = 0;
    let amount1 = 0;
    if (tu <= current) {
      amount1 = liquidity * (hi - lo);
    } else if (tl >= current) {
      amount0 = liquidity * (1 / lo - 1 / hi);
    } else {
      amount0 = liquidity * (1 / sqrtCurrent - 1 / hi);
      amount1 = liquidity * (sqrtCurrent - lo);
    }
    return (amount0 / Math.pow(10, dec0)) * price0
         + (amount1 / Math.pow(10, dec1)) * price1;
  };

  let tvlUsd = 0;
  for (const s of segments) tvlUsd += segmentUsd(s.lower, s.upper, s.liquidity);

  // Same sum, restricted to the band around spot
  const tickOffset = Math.log(1 + ACTIVE_BAND_PCT) / Math.log(1.0001);
  const bandLo = current - tickOffset;
  const bandHi = current + tickOffset;
  let activeTvlUsd = 0;
  for (const s of segments) {
    const lo = Math.max(s.lower, bandLo);
    const hi = Math.min(s.upper, bandHi);
    if (hi > lo) activeTvlUsd += segmentUsd(lo, hi, s.liquidity);
  }

  if (!isFinite(tvlUsd) || tvlUsd <= 0) return null;

  return {
    tvlUsd,
    activeTvlUsd,
    priceToken1PerToken0: Math.pow(1.0001, current) * Math.pow(10, dec0 - dec1),
  };
}
