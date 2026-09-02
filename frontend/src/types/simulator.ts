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

export interface SimPoolInfo {
  source:           "preset" | "live";
  id:               string;
  network?:         string;
  networkName?:     string;
  exchange?:        string;
  exchangeName?:    string;
  name:             string;
  baseSymbol:       string;
  quoteSymbol:      string;
  feeTier:          number;
  feeLabel:         string;
  tvlUsd:           number;
  quoteUsd:         number;
  baseUsd:          number;
  annualVolatility: number;
  poolType:         PoolType;
  invertible:       boolean;
  baseToken?:       0 | 1;
  correlation7d?:   number;
  correlation30d?:  number;
}

export type CalcMethod = "current" | "peak" | "average" | "custom";

export interface DlScenarioInput {
  basePct:  number;
  quotePct: number;
}

export interface SimulationConfig {
  presetId?:      string;
  exchange?:      string;
  network?:       string;
  poolId?:        string;
  baseToken?:     0 | 1;

  currentPrice:   number;
  volume24hUsd:   number;
  lowerPrice:     number;
  upperPrice:     number;
  investmentUsd:  number;
  days?:          number;
  holdingDays?:   number;

  calcMethod?:      CalcMethod;
  customCalcPrice?: number;
  volumeWindow?:    7 | 21 | 30;
  trimSpikes?:      boolean;

  dlScenarios?:   DlScenarioInput[];
}

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
  volumeWindow:       number;
  volumeBasisUsd:     number;
  trimmedDays:        number;
  realisticApr:       number;
  worstCaseApr:       number;
  worstCaseVolumeUsd: number;
  fallbackUniform:    boolean;
}

export interface ChartPoint {
  price:     number;
  ilPct:     number;
  fee30dPct: number;
  netPnlPct: number;
  inRange:   boolean;
}

export interface ScenarioRow {
  price:          number;
  priceChangePct: number;
  positionValue:  number;
  ilPct:          number;
  fees30dUsd:     number;
  netPnlUsd:      number;
  recoveryDays:   number;
  inRange:        boolean;
  isCurrent:      boolean;
}

export interface TvlDayData {
  dayIndex:      number;
  timestampUnix: number;
  tvlUsd:        number;
  feesUsd:       number;
  volumeUsd:     number;
}

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

export interface PriceCandle {
  day:            number;
  timestampUnix?: number;
  open:           number;
  high:           number;
  low:            number;
  close:          number;
  volume:         number;
}

export interface LiquidityBucket {
  price:   number;
  activeL: number;
}

export interface LiquidityDistribution {
  buckets:      LiquidityBucket[];
  currentPrice: number;
  calcPrice:    number;
  clipped:      boolean;
}

export interface DivergenceScenario {
  label:             string;
  source:            "standard" | "historical" | "custom";
  basePct:           number;
  quotePct:          number;
  newPrice:          number;
  inRange:           boolean;
  positionValueUsd:  number;
  hodlValueUsd:      number;
  divergenceLossUsd: number;
  divergenceLossPct: number;
  recoveryDays:      number;
  verdict:           "fast" | "ok" | "slow";
}

export interface DivergenceResult {
  poolType:    PoolType;
  horizonDays: number;
  scenarios:   DivergenceScenario[];
}

// The same position priced at a handful of standard widths. A pool-level APR
// cannot know the range you pick, and the answer moves by multiples across
// these rows, so this is the bridge between screening and a real estimate.
export interface RangePreset {
  widthPct:       number;   // 0.05 = +/-5% around the current price
  lowerPrice:     number;
  upperPrice:     number;
  apr:            number;
  inRangeProb30d: number;   // the counterweight: tighter earns more, exits sooner
  isCurrent:      boolean;
}

export interface RangeGuard {
  windowDays:       number;
  historyDays:      number;
  maxDailyUpPct:    number;
  maxDailyDownPct:  number;
  maxWindowUpPct:   number;
  maxWindowDownPct: number;
  rangeUpPct:       number;
  rangeDownPct:     number;
  coversUp:         boolean;
  coversDown:       boolean;
}

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
  liquidity:    LiquidityDistribution | null;
  divergence:   DivergenceResult;
  rangeGuard:   RangeGuard;
  rangePresets: RangePreset[];
}

export interface LivePoolDefault {
  config: SimulationConfig;
  pool:   SimPoolInfo;
}
