// ── Wallet position tracking (mirrors backend/src/types/track.ts) ────────────

export interface TrackedEarnings {
  unclaimedBase:  number;
  unclaimedQuote: number;
  totalUsd:       number;
}

export interface TrackedBenchmark {
  label:        string;
  hodlValueUsd: number;
  netUsd:       number;
}

export interface SmartFlag {
  kind:     "out-of-range" | "near-entry" | "near-edge" | "info";
  severity: "good" | "warn" | "bad";
  message:  string;
}

export interface HistoryPoint {
  ts:           number;
  inRange:      boolean;
  price:        number;
  valueUsd:     number;
  unclaimedUsd: number;
  retention:    number | null;
}

export interface PositionHistory {
  snapshots:       number;
  firstTs:         number;
  lastTs:          number;
  observedSeconds: number;
  inRangeSeconds:  number;
  gapSeconds:      number;
  inRangePct:      number | null;
  coverage:        number;
  retentionTrend: {
    first: number; last: number; delta: number;
    direction: "up" | "down" | "flat";
  } | null;
  series: HistoryPoint[];
}

export interface WatchedWallet {
  address:    string;
  network:    string;
  addedAt:    number;
  lastPolled: number | null;
  lastError:  string | null;
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
  currentPrice: number;
  lowerPrice:   number;
  upperPrice:   number;

  baseAmount:   number;
  quoteAmount:  number;
  positionValueUsd: number;

  depositedBase:  number;
  depositedQuote: number;
  withdrawnBase:  number;
  withdrawnQuote: number;
  depositUsdAtEntry: number;
  entryTimestamp: number;
  entryApprox:    boolean;

  earnings:     TrackedEarnings;
  benchmarks:   TrackedBenchmark[];
  divergenceLossUsd: number;
  netVsHodlUsd:      number;
  earningsRetention: number;
  aprSinceEntry:     number;
  daysHeld:          number;

  smart: SmartFlag[];
  history: PositionHistory | null;
}

export interface TrackApiResponse {
  data: TrackedPosition[];
  meta: {
    address: string;
    networks: string[];
    fetchedAt: string;
    watched: string[];
    pollIntervalMinutes: number;
  };
}
