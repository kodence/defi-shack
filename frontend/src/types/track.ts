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

export interface TrackedPosition {
  positionId:   string;
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
}

export interface TrackApiResponse {
  data: TrackedPosition[];
  meta: { address: string; networks: string[]; fetchedAt: string };
}
