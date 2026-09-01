import { SavedPosition } from "@/types/portfolio";
import { SimulationConfig, SimulationResult } from "@/types/simulator";

const KEY = "defishack.portfolio.v1";
const LEGACY_KEY = "lpsim.portfolio.v1";   // pre-rename; read once, then migrated

export const STABLE_SYMBOLS = new Set(["USDC", "USDT", "DAI", "FRAX", "LUSD", "crvUSD"]);

export function loadPortfolio(): SavedPosition[] {
  if (typeof window === "undefined") return [];
  try {
    let raw = localStorage.getItem(KEY);
    if (raw === null) {
      // Carry a portfolio saved under the old name across the rename
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy !== null) {
        localStorage.setItem(KEY, legacy);
        localStorage.removeItem(LEGACY_KEY);
        raw = legacy;
      }
    }
    const parsed = raw ? (JSON.parse(raw) as SavedPosition[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePortfolio(positions: SavedPosition[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(positions));
  } catch {
    // storage full/blocked — nothing sensible to do
  }
}

// Snapshot the current simulation into a SavedPosition
export function positionFromResult(cfg: SimulationConfig, result: SimulationResult): SavedPosition {
  const vols = result.tvlHistory.slice(-30).map(d => d.volumeUsd).filter(v => v >= 0);
  let volumeCV: number | null = null;
  if (vols.length >= 2) {
    const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
    if (mean > 0) {
      const varr = vols.reduce((s, v) => s + (v - mean) ** 2, 0) / (vols.length - 1);
      volumeCV = Math.sqrt(varr) / mean;
    }
  }

  const withLoss = result.divergence.scenarios.filter(s => s.recoveryDays !== 0);
  const worstRecoveryDays = withLoss.length
    ? withLoss.reduce((w, s) => (s.recoveryDays < 0 ? Infinity : Math.max(w, s.recoveryDays)), 0)
    : null;

  const a = result.aprBreakdown;
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
    config: { ...cfg, dlScenarios: [] },
    poolName: `${result.pool.name} (${result.pool.feeLabel})`,
    networkName: result.pool.networkName ?? null,
    poolType: result.pool.poolType,
    baseSymbol: result.pool.baseSymbol,
    quoteSymbol: result.pool.quoteSymbol,
    feeLabel: result.pool.feeLabel,
    tvlUsd: result.pool.tvlUsd,
    apr: result.metrics.estimatedApr,
    worstApr: a.worstCaseApr,
    dailyFeesUsd: result.metrics.dailyFeesUsd,
    volumeCV,
    correlation30d: result.pool.correlation30d ?? null,
    depthRatio: a.fallbackUniform || a.realisticApr <= 0 ? null : a.worstCaseApr / a.realisticApr,
    worstRecoveryDays: worstRecoveryDays === Infinity ? 9999 : worstRecoveryDays,
  };
}

// Risk score 0–100 from the doc's risk-assessment factors; grade + backbone pick
export function riskScore(p: SavedPosition): number {
  let score = 0;
  // Volume/fee consistency
  score += p.volumeCV === null ? 12 : p.volumeCV <= 0.5 ? 25 : p.volumeCV <= 1.0 ? 15 : 5;
  // Divergence-loss recovery
  if (p.poolType === "crypto-stable" || p.poolType === "stable-stable") score += 15;
  else if (p.worstRecoveryDays === null) score += 12;
  else score += p.worstRecoveryDays <= 14 ? 25 : p.worstRecoveryDays <= 20 ? 15 : 5;
  // Correlation (crypto-crypto only)
  if (p.poolType !== "crypto-crypto") score += 15;
  else if (p.correlation30d === null) score += 8;
  else score += p.correlation30d >= 0.5 ? 20 : p.correlation30d >= 0.3 ? 12 : 4;
  // Liquidity depth
  score += p.depthRatio === null ? 10 : p.depthRatio >= 0.5 ? 20 : p.depthRatio >= 0.25 ? 12 : 4;
  // Pool size
  score += p.tvlUsd >= 10_000_000 ? 10 : p.tvlUsd >= 1_000_000 ? 6 : 2;
  return score;
}

export function riskGrade(score: number): "A" | "B" | "C" {
  return score >= 75 ? "A" : score >= 55 ? "B" : "C";
}

// Backbone = best risk-adjusted position (doc section G)
export function backboneId(positions: SavedPosition[]): string | null {
  if (!positions.length) return null;
  const best = [...positions].sort((a, b) => {
    const d = riskScore(b) - riskScore(a);
    return d !== 0 ? d : b.apr - a.apr;
  })[0];
  return best.id;
}

// Market-wide move → per-token move for this pool (stables stay put)
export function stressScenario(p: SavedPosition, movePct: number): { basePct: number; quotePct: number } {
  return {
    basePct: STABLE_SYMBOLS.has(p.baseSymbol) ? 0 : movePct,
    quotePct: STABLE_SYMBOLS.has(p.quoteSymbol) ? 0 : movePct,
  };
}
