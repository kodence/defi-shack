import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const apiKey = process.env.THE_GRAPH_API_KEY;
if (!apiKey) {
  throw new Error("THE_GRAPH_API_KEY is required in .env");
}

export interface NetworkConfig {
  name: string;
  exchange: string;
  subgraphUrl: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  ethereum: {
    name: "Ethereum",
    exchange: "Uniswap V3",
    subgraphUrl: `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`,
  },
  arbitrum: {
    name: "Arbitrum",
    exchange: "Uniswap V3",
    subgraphUrl: `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aJM`,
  },
  base: {
    name: "Base",
    exchange: "Uniswap V3",
    subgraphUrl: `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/43Hwfi3dJSoGpyas9VwNoDAv55yjgGrPpNSmbQZArzMG`,
  },
};

export const VALID_NETWORKS = Object.keys(NETWORKS);

export const TOP_POOLS_COUNT = 500;
export const TVL_FLOOR = 1_000_000;
// Uniswap V3's entire TVL is a few billion, so a single pool reporting more
// than this is a subgraph data error (one reports $1.1T). Left in, it dominates
// a TVL-sorted table.
export const TVL_CEILING = 50_000_000_000;

// The subgraph's totalValueLocked* fields drift badly (measured 2.3x-11.2x above
// what LP positions actually hold), so pool TVL is reconstructed from tick
// liquidity instead. That costs one tick query per pool, bounded as follows.
export const TICK_PAGE_SIZE = 1000;
export const TICK_MAX_PAGES = 3;
export const TICK_CONCURRENCY = 12;
export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const VALID_TIMEFRAMES = [7, 14, 30, 90] as const;
export type Timeframe = (typeof VALID_TIMEFRAMES)[number];

export const STABLECOINS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "FRAX",
  "LUSD",
  "crvUSD",
]);

export const PORT = 3001;

// ── Position history (SQLite snapshots) ──────────────────────────────────────
// How often the background poller refreshes watched wallets. Each poll costs
// metered Graph queries per watched wallet, so override with care.
export const SNAPSHOT_POLL_INTERVAL_MS =
  Number(process.env.DEFISHACK_POLL_INTERVAL_MS) > 0
    ? Number(process.env.DEFISHACK_POLL_INTERVAL_MS)
    : 15 * 60 * 1000;
// Longest gap between snapshots still treated as continuous observation.
// Anything longer (server down, wallet unwatched) counts as unobserved rather
// than silently inflating in-range time.
export const SNAPSHOT_MAX_GAP_SEC = 90 * 60;
// Debounce so repeated page loads don't write a row each time
export const SNAPSHOT_MIN_INTERVAL_SEC = 60;
// Snapshots older than this are pruned
export const SNAPSHOT_RETENTION_DAYS = 180;
