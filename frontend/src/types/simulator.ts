export interface PoolPreset {
  id:               string;
  name:             string;
  token0Symbol:     string;
  token1Symbol:     string;
  feeTier:          number;
  feeLabel:         string;
  defaultPrice:     number;
  defaultVolume:    number;
  tvlUsd:           number;
  defaultRangePct:  number;
  annualVolatility: number;
}

export interface SimulationConfig {
  presetId:       string;
  currentPrice:   number;
  volume24hUsd:   number;
  lowerPrice:     number;
  upperPrice:     number;
  investmentUsd:  number;
}

export interface PositionMetrics {
  liquidity:         number;
  token0Amount:      number;
  token1Amount:      number;
  token0ValueUsd:    number;
  token1ValueUsd:    number;
  positionValueUsd:  number;
  estimatedApr:      number;
  dailyFeesUsd:      number;
  capitalEfficiency: number;
  ilAtLower:         number;
  ilAtUpper:         number;
  breakevenDays:     number;
  inRangeProb30d:    number;
  token0Pct:         number;
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
  day:    number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface SimulationResult {
  preset:       PoolPreset;
  config:       SimulationConfig;
  metrics:      PositionMetrics;
  rangeChart:   ChartPoint[];
  scenarios:    ScenarioRow[];
  tvlHistory:   TvlDayData[];
  aprHistory:   AprHistoryResult;
  priceHistory: PriceCandle[];
}
