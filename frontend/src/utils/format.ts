export function formatUSD(value: number): string {
  const sign = value < 0 ? "-" : "";
  const a = Math.abs(value);
  if (a >= 1_000_000_000) {
    return `${sign}$${(a / 1_000_000_000).toFixed(2)}B`;
  }
  if (a >= 1_000_000) {
    return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  }
  if (a >= 1_000) {
    return `${sign}$${(a / 1_000).toFixed(2)}K`;
  }
  return `${sign}$${a.toFixed(2)}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatCorrelation(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
