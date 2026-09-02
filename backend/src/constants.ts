import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const apiKey = process.env.THE_GRAPH_API_KEY;
if (!apiKey) {
  throw new Error("THE_GRAPH_API_KEY is required in .env");
}

const gateway = (id: string) =>
  `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${id}`;

// ── Sources ──────────────────────────────────────────────────────────────────
// A source is one exchange on one network, and says where its data comes
// from. Most are Uniswap-V3-schema subgraphs on The Graph that differ only in
// a handful of field names (the `dialect`); the rest are REST APIs or a
// different schema, each with its own adapter under services/sources/.
//
// Capabilities are per source, not per exchange: the simulator needs tick
// liquidity plus daily OHLC, and the tracker needs position feeGrowth, and
// not every source carries them. Every subgraph ID here was probed with the
// pipeline's own queries before being added (tools/probe-subgraphs.mjs) --
// several deployments that look official on The Graph are unindexed, stale
// or served by one dead indexer, and a docs page cannot tell you that.

export type Dialect = "v3" | "v4" | "hyperswap" | "algebra";
export type SourceKind = "subgraph" | "messari" | "pancake-explorer" | "orca";

export interface SourceConfig {
  key: string;               // "uniswap-v3:polygon"
  exchange: string;          // exchange key
  exchangeName: string;
  network: string;           // network key
  networkName: string;
  kind: SourceKind;
  dialect: Dialect;          // meaningful for kind "subgraph"; "v3" otherwise
  url: string;               // gateway URL, or the REST base for API sources
  discovery: boolean;
  simulator: boolean;
  track: boolean;
  // Parallel requests during discovery. Deployments served by one or two
  // indexers time out under the default burst; Optimism failed on all four
  // of its indexers at once at 10-12.
  concurrency: number;
  note?: string;             // caveat surfaced to the client
}

export const NETWORK_NAMES: Record<string, string> = {
  ethereum:  "Ethereum",
  arbitrum:  "Arbitrum",
  base:      "Base",
  optimism:  "Optimism",
  polygon:   "Polygon",
  bsc:       "BSC",
  avalanche: "Avalanche",
  hyperevm:  "HyperEVM",
  solana:    "Solana",
};

export const EXCHANGE_NAMES: Record<string, string> = {
  "uniswap-v3":     "Uniswap V3",
  "uniswap-v4":     "Uniswap V4",
  "pancakeswap-v3": "PancakeSwap V3",
  "sushiswap-v3":   "SushiSwap V3",
  "quickswap":      "QuickSwap",
  "hyperswap-v3":   "HyperSwap V3",
  "orca":           "Orca",
};

interface Caps { simulator?: boolean; track?: boolean; concurrency?: number }
const DEFAULT_CONCURRENCY = 10;
const FULL: Caps = { simulator: true, track: true };
const SIM:  Caps = { simulator: true };
// Thinly-indexed deployments: same capabilities, gentler request rate
const FULL_SLOW: Caps = { simulator: true, track: true, concurrency: 4 };

function source(
  kind: SourceKind, exchange: string, network: string, dialect: Dialect,
  url: string, caps: Caps = {}, note?: string,
): SourceConfig {
  return {
    key: `${exchange}:${network}`,
    exchange, exchangeName: EXCHANGE_NAMES[exchange],
    network,  networkName:  NETWORK_NAMES[network],
    kind, dialect, url,
    discovery: true,
    simulator: caps.simulator ?? false,
    track:     caps.track ?? false,
    concurrency: caps.concurrency ?? DEFAULT_CONCURRENCY,
    note,
  };
}

const PANCAKE_EXPLORER = "https://explorer.pancakeswap.com/api/cached";
const ORCA_API = "https://api.orca.so/v2/solana";

export const SOURCES: SourceConfig[] = [
  // ── Uniswap V3: the official deployments ──────────────────────────────────
  source("subgraph", "uniswap-v3", "ethereum",  "v3", gateway("5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV"), FULL),
  source("subgraph", "uniswap-v3", "arbitrum",  "v3", gateway("FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aJM"), FULL),
  source("subgraph", "uniswap-v3", "base",      "v3", gateway("43Hwfi3dJSoGpyas9VwNoDAv55yjgGrPpNSmbQZArzMG"), FULL),
  source("subgraph", "uniswap-v3", "optimism",  "v3", gateway("Cghf4LfVqPiFw6fp6Y5X5Ubc8UpmUhSfJL82zwiBFLaj"), FULL_SLOW),
  source("subgraph", "uniswap-v3", "polygon",   "v3", gateway("3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm"), FULL),
  source("subgraph", "uniswap-v3", "avalanche", "v3", gateway("GVH9h9KZ9CqheUEL93qMbq7QwgoBu32QXQDPR6bev4Eo"), FULL),
  // The official BSC deployment (F85MNz...) is served by a single indexer that
  // rejects any non-trivial query. This community deployment carries real
  // query volume but shares that indexer for part of its allocation, so it
  // succeeds only with the gateway retries in querySubgraph.
  source("subgraph", "uniswap-v3", "bsc",       "v3", gateway("G5MUbSBM7Nsrm9tH2tGQUiAF4SZDGf2qeo1xPLYjKr7K"), FULL_SLOW,
    "Indexing on BSC is unreliable; data may be intermittently unavailable"),

  // ── Uniswap V4 ────────────────────────────────────────────────────────────
  // Same schema plus `hooks`; pool ids are bytes32 PoolIds rather than
  // addresses. The Position entity carries no feeGrowth, so no tracking.
  // Base and BSC use the deployments the explorer shows real traffic on --
  // the ones published beside mainnet's are stuck with indexing errors.
  source("subgraph", "uniswap-v4", "ethereum",  "v4", gateway("DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G"), SIM),
  source("subgraph", "uniswap-v4", "arbitrum",  "v4", gateway("G5TsTKNi8yhPSV7kycaE23oWbqv9zzNqR49FoEQjzq1r"), SIM),
  source("subgraph", "uniswap-v4", "base",      "v4", gateway("Gqm2b5J85n1bhCyDMpGbtbVn4935EvvdyHdHrx3dibyj"), SIM),
  source("subgraph", "uniswap-v4", "optimism",  "v4", gateway("6RBtsmGUYfeLeZsYyxyKSUiaA6WpuC69shMEQ1Cfuj9u"), SIM),
  // This deployment's bundle reports the native price as 0, so USD values
  // come from tokenDayData prices (which it does populate) instead.
  source("subgraph", "uniswap-v4", "polygon",   "v4", gateway("2CB2uQxcDKWDenagn2z17KQVCtfwSx5eXYuvqTciRTJu"), SIM),
  source("subgraph", "uniswap-v4", "bsc",       "v4", gateway("EAq1nJKgjnuKH6Gj4RFjCW7LcL7E2uipbncdwV7TTWkX"), SIM),
  source("subgraph", "uniswap-v4", "avalanche", "v4", gateway("49JxRo9FGxWpSf5Y5GKQPj5NUpX2HhpoZHpGzNEWQZjq"), SIM),

  // ── PancakeSwap V3 ────────────────────────────────────────────────────────
  // A V3 fork with the native schema. Its own BSC and Arbitrum subgraphs are
  // broken on the network (BSC has carried an indexing error for years), so
  // those chains read Pancake's explorer API: daily fees, 30d daily volume,
  // ticks and current TVL, but no token price history and no OHLC.
  source("subgraph", "pancakeswap-v3", "ethereum", "v3", gateway("CJYGNhb7RvnhfBDjqpRnD3oxgyhibzc7fkAMa38YV3oS"), FULL),
  source("subgraph", "pancakeswap-v3", "base",     "v3", gateway("5YYKGBcRkJs6tmDfB3RpHdbK2R5KBACHQebXVgbUcYQp"), FULL),
  source("pancake-explorer", "pancakeswap-v3", "bsc",      "v3", PANCAKE_EXPLORER, {},
    "From PancakeSwap's explorer API: no price history, so volatility and correlation are unavailable"),
  source("pancake-explorer", "pancakeswap-v3", "arbitrum", "v3", PANCAKE_EXPLORER, {},
    "From PancakeSwap's explorer API: no price history, so volatility and correlation are unavailable"),

  // ── SushiSwap V3 ──────────────────────────────────────────────────────────
  // Sushi's own V3 subgraphs died with the hosted service. What remains on
  // the network is Messari's standard-schema indexing, which has daily
  // volume, LP revenue, TVL and ticks but only a current token price -- and
  // its TVL ordering is polluted by junk pairs, so swap-count is filtered.
  // No V3 subgraph of any schema exists for Sushi on Polygon, Optimism or BSC.
  source("messari", "sushiswap-v3", "ethereum",  "v3", gateway("2tGWMrDha4164KkFAfkU3rDCtuxGb4q1emXmFdLLzJ8x"), {},
    "Messari-indexed: no price history, so volatility and correlation are unavailable"),
  source("messari", "sushiswap-v3", "arbitrum",  "v3", gateway("3oHCddbQGTi42kPZBwyGzD2JzZR33zK2MwXtxAerNJy2"), {},
    "Messari-indexed: no price history, so volatility and correlation are unavailable"),
  source("messari", "sushiswap-v3", "avalanche", "v3", gateway("9WGqYsU8h1KVZeKz32663gFrbjVUNhBgmhRavMFqiSZz"), {},
    "Messari-indexed: no price history, so volatility and correlation are unavailable"),

  // ── QuickSwap (Algebra Integral) ──────────────────────────────────────────
  // Algebra, not a Uniswap fork, but the subgraph mirrors the V3 schema with
  // a dynamic `fee` in place of `feeTier` and MATIC-named pricing fields.
  // This is QuickSwap's current (Integral, "V4") deployment; the older V3
  // one is drained to nothing and served by two failing indexers. Even here
  // the largest pool is around $120K, under the $1M floor, so the source
  // returns no rows until the floor is lowered or the liquidity returns.
  source("subgraph", "quickswap", "polygon", "algebra", gateway("5JUgNJk47FJRjKRzhZ8JtBpWQA4GyRFzNQFCKNpxkvCM"), FULL,
    "Fee tier is Algebra's dynamic fee at the time of the query"),

  // ── HyperSwap V3 (HyperEVM) ───────────────────────────────────────────────
  // Native V3 schema on a Graph-compatible endpoint hosted by Ormi Labs; only
  // the native-token pricing fields are renamed.
  source("subgraph", "hyperswap-v3", "hyperevm", "hyperswap",
    "https://api.subgraph.ormilabs.com/api/public/33c67399-d625-4929-b239-5709cd66e422/subgraphs/hyperswap-v3/v0.1.2/gn", FULL),

  // ── Orca (Solana) ─────────────────────────────────────────────────────────
  // Whirlpools are concentrated liquidity too, but Orca's public API exposes
  // only 24h/7d/30d aggregates -- no daily series, no ticks, no history -- so
  // this is discovery with the series-derived columns blank.
  source("orca", "orca", "solana", "v3", ORCA_API, {},
    "Orca's API reports 7d/30d aggregates only: no daily series, volatility or correlation"),
];

export const VALID_NETWORKS  = Object.keys(NETWORK_NAMES);
export const VALID_EXCHANGES = Object.keys(EXCHANGE_NAMES);
// Networks with at least one source the tracker can read positions from
export const TRACK_NETWORKS = [...new Set(SOURCES.filter((s) => s.track).map((s) => s.network))];

export function findSource(exchange: string, network: string): SourceConfig | undefined {
  return SOURCES.find((s) => s.exchange === exchange && s.network === network);
}

export function sourcesFor(
  networks: string[], exchanges: string[], cap: "discovery" | "simulator" | "track",
): SourceConfig[] {
  return SOURCES.filter(
    (s) => s[cap] && networks.includes(s.network) && exchanges.includes(s.exchange),
  );
}

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
// The gateway reports "bad indexers" when every indexer it tried failed. On
// deployments with one or two flaky indexers that is a coin flip per request,
// so a request is retried this many times with backoff before giving up.
export const GATEWAY_RETRIES = 3;
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
