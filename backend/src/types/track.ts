// ── Wallet position tracking (Metrix "Track" equivalent) ─────────────────────

// Unclaimed fees only, computed from on-chain feeGrowth values. The subgraph's
// collectedFeesToken1 mirrors token0 (long-standing data bug), so lifetime
// collected fees cannot be trusted and are deliberately excluded.
export interface TrackedEarnings {
  unclaimedBase:  number;
  unclaimedQuote: number;
  totalUsd:       number;   // unclaimed fees valued at current prices
}

// Each "what if I had held…" benchmark, valued at CURRENT prices
export interface TrackedBenchmark {
  label:        string;
  hodlValueUsd: number;   // value of that holding strategy today
  netUsd:       number;   // (position + earnings) − hodl
}

export interface SmartFlag {
  kind:     "out-of-range" | "near-entry" | "near-edge" | "info";
  severity: "good" | "warn" | "bad";
  message:  string;
}

// ── Recorded history (SQLite snapshots) ──────────────────────────────────────

export interface HistoryPoint {
  ts:           number;
  inRange:      boolean;
  price:        number;
  valueUsd:     number;
  unclaimedUsd: number;
  retention:    number | null;   // net vs HODL ÷ earnings at that moment
}

export interface PositionHistory {
  snapshots:       number;
  firstTs:         number;
  lastTs:          number;
  observedSeconds: number;   // time actually covered by snapshots
  inRangeSeconds:  number;
  gapSeconds:      number;   // elapsed time we could not observe
  inRangePct:      number | null;
  coverage:        number;   // observed ÷ (now − firstTs)
  retentionTrend: {
    first: number; last: number; delta: number;
    direction: "up" | "down" | "flat";
  } | null;
  series: HistoryPoint[];
}

export interface TrackedPosition {
  positionId:   string;
  owner:        string;
  network:      string;
  networkName:  string;
  poolId:       string;
  poolName:     string;
  feeLabel:     string;
  baseSymbol:   string;
  quoteSymbol:  string;

  inRange:      boolean;
  currentPrice: number;    // oriented: quote per base
  lowerPrice:   number;
  upperPrice:   number;

  baseAmount:   number;    // current holdings in the position
  quoteAmount:  number;
  positionValueUsd: number;

  depositedBase:  number;
  depositedQuote: number;
  withdrawnBase:  number;
  withdrawnQuote: number;
  depositUsdAtEntry: number;   // deposit valued at entry-day prices
  entryTimestamp: number;
  entryApprox:    boolean;     // entry prices fell back to current prices

  earnings:     TrackedEarnings;
  benchmarks:   TrackedBenchmark[];   // initial / 50-50 / all base / all quote
  divergenceLossUsd: number;          // position − hodl(initial), ≤ 0 usually
  netVsHodlUsd:      number;          // divergenceLoss + earnings
  earningsRetention: number;          // netVsHodl / earnings (when earnings > 0)
  aprSinceEntry:     number;          // fee APR on entry capital
  daysHeld:          number;

  smart: SmartFlag[];

  // Populated from recorded snapshots; null until history exists
  history: PositionHistory | null;
}

export interface TrackApiResponse {
  data: TrackedPosition[];
  meta: {
    address: string;
    networks: string[];
    fetchedAt: string;
    watched: string[];          // networks currently polled in the background
    pollIntervalMinutes: number;
  };
}
