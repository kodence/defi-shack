import { PoolType, SimulationConfig } from "./simulator";

// A simulated position saved from the simulator into the portfolio builder.
// Stored in localStorage (key: defishack.portfolio.v1) — metrics are a snapshot
// from save time and refresh when the allocation is edited or stress-tested.
export interface SavedPosition {
  id:       string;
  savedAt:  number;
  config:   SimulationConfig;

  poolName:    string;
  networkName: string | null;   // null for presets
  poolType:    PoolType;
  baseSymbol:  string;
  quoteSymbol: string;
  feeLabel:    string;
  tvlUsd:      number;

  apr:              number;
  worstApr:         number;
  dailyFeesUsd:     number;
  volumeCV:         number | null;
  correlation30d:   number | null;
  depthRatio:       number | null;   // worst-case APR / realistic APR
  worstRecoveryDays: number | null;  // slowest divergence scenario
}

export interface StressRow {
  positionId:        string;
  divergenceLossUsd: number;
  positionValueUsd:  number;   // after the move
  recoveryDays:      number;
  failed?:           boolean;
}
