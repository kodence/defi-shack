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
export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const VALID_TIMEFRAMES = [7, 30, 90] as const;
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
