import { SourceConfig, Timeframe, TVL_FLOOR, TVL_CEILING } from "../../constants";
import { ComputedPool } from "../../types/pool";
import { getJson, poolLabel } from "./common";

// Orca's public API (Solana). Whirlpools are concentrated-liquidity pools,
// but the API only exposes 24h/7d/30d aggregates per pool -- no daily
// series, no tick list, no price history -- so this is discovery with the
// series-derived columns left blank, and the simulator cannot run on it.
// The window is the nearest one Orca reports: 7d for the 7/14-day
// timeframes, 30d for 30/90.

interface OrcaToken { address: string; symbol: string; decimals: number }
interface OrcaStats { volume: string; fees: string; yieldOverTvl: string }
interface OrcaPool {
  address: string;
  tokenA: OrcaToken;
  tokenB: OrcaToken;
  feeRate: number;          // hundredths of a basis point, same unit as V3 feeTier
  tvlUsdc: string;
  hasWarning: boolean;
  stats: Record<"24h" | "7d" | "30d", OrcaStats | undefined>;
}
interface OrcaPage { data: OrcaPool[]; meta: { next: string | null } }

export async function fetchOrcaDiscovery(
  source: SourceConfig,
  timeframe: Timeframe,
): Promise<ComputedPool[]> {
  const window: "7d" | "30d" = timeframe <= 14 ? "7d" : "30d";
  const windowDays = window === "7d" ? 7 : 30;

  const pools: OrcaPool[] = [];
  let next: string | null = null;
  do {
    const url = `${source.url}/pools?stats=24h,7d,30d&minTvl=${TVL_FLOOR}&sortBy=tvl&sortDirection=desc&size=100`
      + (next ? `&next=${encodeURIComponent(next)}` : "");
    const page: OrcaPage = await getJson<OrcaPage>(url);
    pools.push(...page.data);
    next = page.meta?.next ?? null;
  } while (next && pools.length < 500);

  return pools
    .filter((p) => !p.hasWarning)
    .flatMap((p) => {
      const tvl = parseFloat(p.tvlUsdc);
      const s = p.stats?.[window];
      if (!(tvl >= TVL_FLOOR) || tvl > TVL_CEILING || !s) return [];
      const avgDailyFees = parseFloat(s.fees) / windowDays;
      const avgDailyVolume = parseFloat(s.volume) / windowDays;
      const apr = tvl > 0 ? (avgDailyFees / tvl) * 365 * 100 : 0;
      const row: ComputedPool = {
        id: p.address,
        poolName: poolLabel(p.tokenA.symbol, p.tokenB.symbol, p.feeRate),
        token0: { id: p.tokenA.address, symbol: p.tokenA.symbol },
        token1: { id: p.tokenB.address, symbol: p.tokenB.symbol },
        feeTier: p.feeRate,
        exchange: source.exchangeName,
        exchangeId: source.exchange,
        network: source.networkName,
        networkId: source.network,
        canSimulate: source.simulator,
        canTrack: source.track,
        tvl,
        tvlSource: "api",
        apr,
        avgDailyFees,
        avgDailyVolume,
        priceVolatility: null,
        correlation: null,
        feeToTvlPct: tvl > 0 ? (avgDailyFees / tvl) * 100 : 0,
        volumeCV: null,
        correlation7d: null,
        correlation30d: null,
        sourceNote: source.note,
      };
      return [row];
    });
}
