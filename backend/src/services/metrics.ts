import { SubgraphPoolDayData, SubgraphTokenDayData } from "../types/subgraph";
import { STABLECOINS } from "../constants";

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

export function computeAPR(avgDailyFees: number, avgDailyTVL: number): number {
  if (avgDailyTVL === 0) return 0;
  return (avgDailyFees / avgDailyTVL) * 365 * 100;
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
