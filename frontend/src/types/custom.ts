// ── Custom (manually tracked) positions — doc section K ──────────────────────
// For pools/DEXes the wallet tracker can't see. All values are user-entered
// from the DEX UI / block explorer; current token prices come from CoinGecko
// ids (with optional manual overrides). Stored in localStorage.

export interface CustomToken {
  symbol:           string;
  coingeckoId:      string;   // e.g. "ethereum", "lido-dao" — may be blank if override set
  priceOverrideUsd: number | null;
}

export type InteractionType = "deposit" | "claim" | "withdraw";

// Deposits/claims/withdrawals record their own USD value + gas at the time,
// exactly as the doc's copy-paste flow prescribes.
export interface CustomInteraction {
  type:        InteractionType;
  ts:          number;    // unix seconds
  amountBase:  number;
  amountQuote: number;
  usdValue:    number;    // total USD of both sides at the time
  gasUsd:      number;
}

// A performance check: live values copied from the DEX position page
export interface CustomCheck {
  ts:             number;
  amountBase:     number;   // currently in the position
  amountQuote:    number;
  unclaimedBase:  number;
  unclaimedQuote: number;
  poolPrice:      number;   // quote per base, from the DEX market widget
}

export interface CustomPosition {
  id:         string;
  createdAt:  number;
  base:       CustomToken;
  quote:      CustomToken;
  exchange:   string;      // organizational only
  network:    string;      // organizational only
  feeTier:    string;      // e.g. "0.3%"
  lowerPrice: number;      // quote per base
  upperPrice: number;
  interactions: CustomInteraction[];
  checks:       CustomCheck[];
  status:     "open" | "closed";
}

// Derived stats for display (nullable pieces need current USD prices)
export interface CustomStats {
  latestCheck:       CustomCheck | null;
  basePriceUsd:      number | null;
  quotePriceUsd:     number | null;
  positionValueUsd:  number | null;
  unclaimedUsd:      number | null;
  claimedUsd:        number;
  earningsUsd:       number | null;
  depositUsd:        number;    // as recorded at deposit time
  withdrawnUsd:      number;
  gasUsd:            number;
  hodlValueUsd:      number | null;   // net deposited amounts at current prices
  divergenceLossUsd: number | null;
  netVsHodlUsd:      number | null;
  overallPnlUsd:     number | null;
  aprSinceEntry:     number | null;
  daysHeld:          number;
  inRange:           boolean | null;
}
