import { SubgraphPoolDayData, SubgraphTokenDayData } from "../types/subgraph";
import { STABLECOINS, TVL_CEILING } from "../constants";

// Restricts a pool's history to days that can be measured, dropping two kinds
// of record:
//
//   1. The current UTC day, which is still accumulating. Its feesUSD/volumeUSD
//      are partial, so averaging it as a whole day understates every rate --
//      worst on short timeframes.
//   2. Days whose reported TVL is not credible. The subgraph occasionally emits
//      a corrupt figure (one pool reports $9.9T on a single day against a $1.7M
//      median), and one such day wrecks a 90-day average.
export function usableDays(dayDatas: SubgraphPoolDayData[]): SubgraphPoolDayData[] {
  const todayStart = Math.floor(Date.now() / 1000 / 86_400) * 86_400;
  return dayDatas.filter(
    (d) => d.date < todayStart && parseFloat(d.tvlUSD) <= TVL_CEILING
  );
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function computeAvgDailyFees(dayDatas: SubgraphPoolDayData[]): number {
  if (dayDatas.length === 0) return 0;
  return mean(dayDatas.map((d) => parseFloat(d.feesUSD)));
}

export function computeAvgDailyVolume(
  dayDatas: SubgraphPoolDayData[]
): number {
  if (dayDatas.length === 0) return 0;
  return mean(dayDatas.map((d) => parseFloat(d.volumeUSD)));
}

export function computeAvgDailyTVL(dayDatas: SubgraphPoolDayData[]): number {
  if (dayDatas.length === 0) return 0;
  return mean(dayDatas.map((d) => parseFloat(d.tvlUSD)));
}

// Mean of each day's yield, not mean(fees) / mean(TVL): the ratio of means
// silently weights high-TVL days more heavily, which skews the result whenever
// a pool's TVL trends over the window.
// `tvlScale` rescales the subgraph's daily TVL onto the level reconstructed
// from tick liquidity (see services/poolLiquidity.ts). The daily series has the
// right shape but the wrong level, so one factor corrects it.
export function computeAPRFromSeries(
  dayDatas: SubgraphPoolDayData[],
  tvlScale = 1
): number {
  const dailyYields = dayDatas
    .map((d) => ({ fees: parseFloat(d.feesUSD), tvl: parseFloat(d.tvlUSD) * tvlScale }))
    .filter((d) => d.tvl > 0)
    .map((d) => d.fees / d.tvl);
  if (dailyYields.length === 0) return 0;
  return mean(dailyYields) * 365 * 100;
}

// Max deviation from mean, normalized as percentage of mean
export function computeVolatility(
  tokenDayDatas: SubgraphTokenDayData[]
): number {
  if (tokenDayDatas.length === 0) return 0;

  const prices = tokenDayDatas.map((d) => parseFloat(d.priceUSD));
  const avg = mean(prices);
  if (avg === 0) return 0;

  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const maxDeviation = Math.max(avg - lowest, highest - avg);

  return (maxDeviation / avg) * 100;
}

// Pearson correlation coefficient between two price series
export function computeCorrelation(
  token0Prices: SubgraphTokenDayData[],
  token1Prices: SubgraphTokenDayData[]
): number {
  // Build date-keyed maps for alignment
  const map0 = new Map<number, number>();
  const map1 = new Map<number, number>();
  token0Prices.forEach((d) => map0.set(d.date, parseFloat(d.priceUSD)));
  token1Prices.forEach((d) => map1.set(d.date, parseFloat(d.priceUSD)));

  // Find overlapping dates
  const commonDates = [...map0.keys()].filter((date) => map1.has(date));
  if (commonDates.length < 2) return 0;

  const x = commonDates.map((d) => map0.get(d)!);
  const y = commonDates.map((d) => map1.get(d)!);

  const meanX = mean(x);
  const meanY = mean(y);

  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denominator = Math.sqrt(sumX2 * sumY2);
  if (denominator === 0) return 0;

  return sumXY / denominator;
}

// Daily fee-to-TVL ratio in % — FATE guidance targets ~0.059%+ for actively traded pools
export function computeFeeToTvl(avgDailyFees: number, avgDailyTVL: number): number {
  if (avgDailyTVL === 0) return 0;
  return (avgDailyFees / avgDailyTVL) * 100;
}

// Coefficient of variation of daily volume (stddev / mean) — lower = more
// consistent volume (VALID "APR and Volume Consistency" check)
export function computeVolumeCV(dayDatas: SubgraphPoolDayData[]): number {
  const vols = dayDatas.map((d) => parseFloat(d.volumeUSD)).filter((v) => v >= 0);
  if (vols.length < 2) return 0;
  const avg = mean(vols);
  if (avg === 0) return 0;
  const variance = vols.reduce((s, v) => s + (v - avg) ** 2, 0) / (vols.length - 1);
  return Math.sqrt(variance) / avg;
}

// Pearson correlation restricted to the last `days` days of both series
export function computeCorrelationWindow(
  token0Prices: SubgraphTokenDayData[],
  token1Prices: SubgraphTokenDayData[],
  days: number
): number {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86_400;
  return computeCorrelation(
    token0Prices.filter((d) => d.date >= cutoff),
    token1Prices.filter((d) => d.date >= cutoff)
  );
}

// Determine which token to use for volatility calculation
export function getVolatilityTokenId(
  token0: { id: string; symbol: string },
  token1: { id: string; symbol: string }
): string {
  // If either token is a stablecoin, use the other
  if (STABLECOINS.has(token0.symbol)) return token1.id;
  if (STABLECOINS.has(token1.symbol)) return token0.id;
  // If neither is a stablecoin, use token0
  return token0.id;
}
