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

// Series-derived metrics are null where a source has no daily price data
export function formatPercent(value: number | null, decimals = 2): string {
  return value === null ? "—" : `${value.toFixed(decimals)}%`;
}

export function formatCorrelation(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(2)}%`;
}
