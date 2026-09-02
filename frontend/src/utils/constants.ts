export const API_BASE_URL = "http://localhost:3001";
export const ROWS_PER_PAGE = 15;
export const MAX_PAGES = 5;
export const MAX_DISPLAY_ROWS = ROWS_PER_PAGE * MAX_PAGES; // 100

export type SortableColumn =
  | "poolName"
  | "exchange"
  | "network"
  | "tvl"
  | "apr"
  | "avgDailyFees"
  | "avgDailyVolume"
  | "feeToTvlPct"
  | "volumeCV"
  | "correlation"
  | "priceVolatility";

export interface ColumnDef {
  key: SortableColumn;
  label: string;
  filterable: boolean;
  // Hidden on first load; still togglable from the Columns control. Used to
  // keep the default table narrow now that there are several APR variants.
  defaultHidden?: boolean;
}

export const COLUMN_PREFS_KEY = "defishack.columns.v1";

export const COLUMNS: ColumnDef[] = [
  { key: "poolName", label: "Pool Name", filterable: false },
  { key: "exchange", label: "Exchange", filterable: false },
  { key: "network", label: "Network", filterable: false },
  { key: "tvl", label: "TVL", filterable: true },
  { key: "apr", label: "APR", filterable: true },
  { key: "avgDailyFees", label: "Daily Fees", filterable: true },
  { key: "avgDailyVolume", label: "Daily Vol", filterable: true },
  { key: "feeToTvlPct", label: "Fee/TVL", filterable: true },
  { key: "volumeCV", label: "Vol CV", filterable: true },
  { key: "correlation", label: "Correlation", filterable: true },
  { key: "priceVolatility", label: "Volatility", filterable: true },
];

// FATE framework thresholds: APR 10–100%, TVL ≥ $1M, volatility < 15%.
// Correlation is deliberately NOT auto-filtered (the doc's flow checks it
// manually) — a stable-quoted pool reports 0 and would always be excluded.
// The band applies to pool-wide APR. An earlier version filtered an
// "in-range APR" proxy on a 30-500% band, but that figure divided fees by the
// value of liquidity near spot, which assumes your capital carries the same
// liquidity density as the tightest positions in the pool. Simulating a real
// position showed it running ~3x optimistic, so it was dropped.
export const FATE_FILTERS: Record<string, { min: string; max: string }> = {
  apr: { min: "10", max: "100" },
  tvl: { min: "1000000", max: "" },
  priceVolatility: { min: "", max: "15" },
};

// Fee-to-TVL ratio considered "actively traded" by the FATE guidance
export const FEE_TO_TVL_TARGET = 0.059;

export const TIMEFRAMES = [7, 14, 30, 90] as const;

export const NETWORKS = [
  { key: "ethereum", label: "Ethereum" },
  { key: "arbitrum", label: "Arbitrum" },
  { key: "base", label: "Base" },
] as const;

export const EXCHANGES = [
  { key: "uniswap-v3", label: "Uniswap-V3" },
] as const;

// Icon mapping — drop SVG/PNG files into frontend/public/icons/
// File names must match the values below (e.g. ethereum.svg, uniswap-v3.svg)
export const NETWORK_ICONS: Record<string, string> = {
  Ethereum: "/icons/ethereum.png",
  Arbitrum: "/icons/arbitrum.png",
  Base: "/icons/base.png",
};

export const EXCHANGE_ICONS: Record<string, string> = {
  "Uniswap-V3": "/icons/uniswap-v3.png",
};
