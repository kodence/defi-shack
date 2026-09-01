// ── Pool ──────────────────────────────────────────────────────────────────────
export interface PoolPreset {
  id:               string;
  name:             string;
  token0Symbol:     string;   // base
  token1Symbol:     string;   // quote
  feeTier:          number;
  feeLabel:         string;
  defaultPrice:     number;
  defaultVolume:    number;
  tvlUsd:           number;
  defaultRangePct:  number;
  annualVolatility: number;
}

export type PoolType = "crypto-crypto" | "crypto-stable" | "stable-stable";

// Unified pool descriptor for a simulation (preset or live subgraph pool)
export interface SimPoolInfo {
  source:           "preset" | "live";
  id:               string;          // presetId or pool address
  network?:         string;          // network key ("ethereum"), live only
  networkName?:     string;          // display name, live only
  name:             string;          // "WETH / USDC"
  baseSymbol:       string;
  quoteSymbol:      string;
  feeTier:          number;
  feeLabel:         string;
  tvlUsd:           number;
  quoteUsd:         number;          // USD price of 1 quote token (1 for presets)
  baseUsd:          number;          // USD price of 1 base token
  annualVolatility: number;          // preset value, or computed from real returns
  poolType:         PoolType;
  invertible:       boolean;         // live pools support base/quote toggle
  baseToken?:       0 | 1;           // live: which subgraph token is the base
}

// ── Simulation config (user inputs) ──────────────────────────────────────────
export type CalcMethod = "current" | "peak" | "average" | "custom";

export interface DlScenarioInput {
  basePct:  number;   // base token USD price change, e.g. -0.10 = -10%
  quotePct: number;
}

export interface SimulationConfig {
  // Pool source: either a preset, or a live subgraph pool
  presetId?:      string;
  network?:       string;
  poolId?:        string;
  baseToken?:     0 | 1;          // live orientation; omitted = auto

  currentPrice:   number;         // oriented: quote per base
  volume24hUsd:   number;         // preset mode: manual volume input
  lowerPrice:     number;
  upperPrice:     number;
  investmentUsd:  number;
  days?:          number;

  // Realistic APR (live pools)
  calcMethod?:      CalcMethod;   // default "current"
  customCalcPrice?: number;       // used when calcMethod === "custom"
  volumeWindow?:    7 | 21 | 30;  // historical volume basis, default 30
  trimSpikes?:      boolean;      // exclude spike days (> 3× median) from volume avg

  // Divergence-loss custom scenario
  dlScenarios?:   DlScenarioInput[];
}

// ── Computed metrics ──────────────────────────────────────────────────────────
export interface PositionMetrics {
  liquidity:          number;
  baseAmount:         number;
  quoteAmount:        number;
  baseValueUsd:       number;
  quoteValueUsd:      number;
  positionValueUsd:   number;
  estimatedApr:       number;
  dailyFeesUsd:       number;
  capitalEfficiency:  number;
  ilAtLower:          number;
  ilAtUpper:          number;
  breakevenDays:      number;
  inRangeProb30d:     number;
  basePct:            number;
}

export interface AprBreakdown {
  method:             CalcMethod;
  volumeWindow:       number;      // days used for the volume basis (0 = manual)
  volumeBasisUsd:     number;      // avg daily volume actually used
  trimmedDays:        number;      // spike days excluded from the average
  realisticApr:       number;      // = metrics.estimatedApr
  worstCaseApr:       number;      // peak-liquidity competition + 7d volume
  worstCaseVolumeUsd: number;
  fallbackUniform:    boolean;     // true when tick data unavailable → uniform TVL estimate
}

// ── Chart / table data ────────────────────────────────────────────────────────
export interface ChartPoint {
  price:       number;
  ilPct:       number;
  fee30dPct:   number;
  netPnlPct:   number;
  inRange:     boolean;
}

export interface ScenarioRow {
  price:           number;
  priceChangePct:  number;
  positionValue:   number;
  ilPct:           number;
  fees30dUsd:      number;
  netPnlUsd:       number;
  recoveryDays:    number;   // days of fees to cover the IL (0 = none, Infinity → -1)
  inRange:         boolean;
  isCurrent:       boolean;
}

export interface TvlDayData {
  dayIndex:      number;
  timestampUnix: number;
  tvlUsd:        number;
  feesUsd:       number;
  volumeUsd:     number;
}

// ── APR History ───────────────────────────────────────────────────────────────
export interface DailyAprSample {
  dayIndex:         number;
  timestampUnix:    number;
  feesUsd:          number;
  positionValueUsd: number;
  dailyApr:         number;
  inRange:          boolean;
}

export interface AprHistoryResult {
  dailySamplesB: DailyAprSample[];
  averageAprB:   number;
  weightedAprB:  number;
  daysCounted:   number;
}

// ── Price history (OHLCV candles) ─────────────────────────────────────────────
export interface PriceCandle {
  day:            number;
  timestampUnix?: number;   // present for live pools
  open:           number;
  high:           number;
  low:            number;
  close:          number;
  volume:         number;
}

// ── Liquidity distribution (live pools) ───────────────────────────────────────
export interface LiquidityBucket {
  price:   number;   // oriented bucket midpoint
  activeL: number;   // active liquidity (adjusted units)
}

export interface LiquidityDistribution {
  buckets:      LiquidityBucket[];  // ascending oriented price
  currentPrice: number;
  calcPrice:    number;             // price the APR calculation method used
  clipped:      boolean;            // tick window hit the page cap
}

// ── Divergence-loss simulation ────────────────────────────────────────────────
export interface DivergenceScenario {
  label:             string;
  source:            "standard" | "historical" | "custom";
  basePct:           number;
  quotePct:          number;
  newPrice:          number;    // oriented pair price after the move
  inRange:           boolean;
  positionValueUsd:  number;
  hodlValueUsd:      number;
  divergenceLossUsd: number;    // position − hodl (≤ 0)
  divergenceLossPct: number;    // vs hodl
  recoveryDays:      number;    // days of current fees to cover the loss (-1 = never)
  verdict:           "fast" | "ok" | "slow";
}

export interface DivergenceResult {
  poolType:    PoolType;
  horizonDays: number;          // move window the verdict is judged against
  scenarios:   DivergenceScenario[];
}

// ── Full simulation response ──────────────────────────────────────────────────
export interface SimulationResult {
  pool:         SimPoolInfo;
  config:       SimulationConfig;
  metrics:      PositionMetrics;
  aprBreakdown: AprBreakdown;
  rangeChart:   ChartPoint[];
  scenarios:    ScenarioRow[];
  tvlHistory:   TvlDayData[];
  aprHistory:   AprHistoryResult;
  priceHistory: PriceCandle[];
  liquidity:    LiquidityDistribution | null;  // null in preset mode
  divergence:   DivergenceResult;
}
