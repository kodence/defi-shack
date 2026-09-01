import { CustomCheck, CustomPosition, CustomStats } from "@/types/custom";

const KEY = "lpsim.custom.v1";

export function loadCustomPositions(): CustomPosition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CustomPosition[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomPositions(positions: CustomPosition[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(positions));
  } catch {
    // storage blocked/full
  }
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Resolve a token's current USD price: manual override wins, else CoinGecko map
function resolvePrice(
  override: number | null, coingeckoId: string,
  prices: Record<string, number>,
): number | null {
  if (override && override > 0) return override;
  const p = prices[coingeckoId];
  return typeof p === "number" && p > 0 ? p : null;
}

// All the doc-K analytics: earnings to date, profit vs HODL, divergence loss,
// range status — from recorded interactions, the latest check, and prices.
export function computeStats(
  pos: CustomPosition,
  prices: Record<string, number>,
): CustomStats {
  const basePriceUsd = resolvePrice(pos.base.priceOverrideUsd, pos.base.coingeckoId, prices);
  const quotePriceUsd = resolvePrice(pos.quote.priceOverrideUsd, pos.quote.coingeckoId, prices);
  const latestCheck: CustomCheck | null =
    pos.checks.length ? pos.checks[pos.checks.length - 1] : null;

  let depositUsd = 0, withdrawnUsd = 0, claimedUsd = 0, gasUsd = 0;
  let netBase = 0, netQuote = 0;
  let firstDeposit = 0;
  for (const it of pos.interactions) {
    gasUsd += it.gasUsd;
    if (it.type === "deposit") {
      depositUsd += it.usdValue;
      netBase += it.amountBase;
      netQuote += it.amountQuote;
      if (!firstDeposit || it.ts < firstDeposit) firstDeposit = it.ts;
    } else if (it.type === "withdraw") {
      withdrawnUsd += it.usdValue;
      netBase -= it.amountBase;
      netQuote -= it.amountQuote;
    } else {
      claimedUsd += it.usdValue;
    }
  }

  const havePrices = basePriceUsd !== null && quotePriceUsd !== null;
  const closed = pos.status === "closed";

  const positionValueUsd = closed
    ? 0
    : latestCheck && havePrices
      ? latestCheck.amountBase * basePriceUsd! + latestCheck.amountQuote * quotePriceUsd!
      : null;

  const unclaimedUsd = closed
    ? 0
    : latestCheck && havePrices
      ? latestCheck.unclaimedBase * basePriceUsd! + latestCheck.unclaimedQuote * quotePriceUsd!
      : null;

  const earningsUsd = unclaimedUsd !== null ? claimedUsd + unclaimedUsd : null;

  // HODL benchmark: what the (net) deposited tokens would be worth if just held
  const hodlValueUsd = havePrices
    ? Math.max(netBase, 0) * basePriceUsd! + Math.max(netQuote, 0) * quotePriceUsd!
    : null;

  const divergenceLossUsd =
    !closed && positionValueUsd !== null && hodlValueUsd !== null
      ? positionValueUsd - hodlValueUsd
      : null;
  const netVsHodlUsd =
    divergenceLossUsd !== null && earningsUsd !== null
      ? divergenceLossUsd + earningsUsd
      : null;

  // Overall P/L: everything that came back (or is still in the pool) minus
  // everything put in, gas included
  const overallPnlUsd =
    positionValueUsd !== null && earningsUsd !== null
      ? positionValueUsd + earningsUsd + withdrawnUsd - depositUsd - gasUsd
      : closed
        ? claimedUsd + withdrawnUsd - depositUsd - gasUsd
        : null;

  const now = Math.floor(Date.now() / 1000);
  const daysHeld = firstDeposit ? Math.max((now - firstDeposit) / 86_400, 0.04) : 0;
  const aprSinceEntry =
    earningsUsd !== null && depositUsd > 0 && daysHeld > 0
      ? (earningsUsd / depositUsd) * (365 / daysHeld)
      : null;

  const inRange = closed || !latestCheck
    ? null
    : latestCheck.poolPrice >= pos.lowerPrice && latestCheck.poolPrice <= pos.upperPrice;

  return {
    latestCheck,
    basePriceUsd, quotePriceUsd,
    positionValueUsd, unclaimedUsd, claimedUsd, earningsUsd,
    depositUsd, withdrawnUsd, gasUsd,
    hodlValueUsd, divergenceLossUsd, netVsHodlUsd, overallPnlUsd,
    aprSinceEntry, daysHeld, inRange,
  };
}

// Every CoinGecko id referenced by open custom positions (for one price fetch)
export function collectCoingeckoIds(positions: CustomPosition[]): string[] {
  const ids = new Set<string>();
  for (const p of positions) {
    if (!p.base.priceOverrideUsd && p.base.coingeckoId) ids.add(p.base.coingeckoId);
    if (!p.quote.priceOverrideUsd && p.quote.coingeckoId) ids.add(p.quote.coingeckoId);
  }
  return [...ids];
}
