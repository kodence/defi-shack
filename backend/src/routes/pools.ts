import { Router, Request, Response } from "express";
import {
  VALID_TIMEFRAMES, Timeframe, VALID_NETWORKS, VALID_EXCHANGES, sourcesFor, SourceConfig,
} from "../constants";
import { getCached, setCache } from "../services/cache";
import { fetchSubgraphDiscovery } from "../services/sources/subgraphDiscovery";
import { fetchPancakeExplorerDiscovery } from "../services/sources/pancakeExplorer";
import { fetchOrcaDiscovery } from "../services/sources/orca";
import { fetchMessariDiscovery } from "../services/sources/messari";
import { ComputedPool, ApiResponse } from "../types/pool";

const router = Router();

function parseList(param: unknown, valid: string[], fallback: string[]): string[] | null {
  if (!param || typeof param !== "string") return fallback;
  const keys = param.split(",").map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (!keys.length) return fallback;
  for (const k of keys) {
    if (!valid.includes(k)) return null;
  }
  return keys;
}

function fetchSource(source: SourceConfig, timeframe: Timeframe, startTimestamp: number): Promise<ComputedPool[]> {
  switch (source.kind) {
    case "subgraph":         return fetchSubgraphDiscovery(source, timeframe, startTimestamp);
    case "messari":          return fetchMessariDiscovery(source, timeframe, startTimestamp);
    case "pancake-explorer": return fetchPancakeExplorerDiscovery(source, timeframe, startTimestamp);
    case "orca":             return fetchOrcaDiscovery(source, timeframe);
  }
}

router.get("/", async (req: Request, res: Response) => {
  const timeframeParam = parseInt(req.query.timeframe as string, 10);

  if (!VALID_TIMEFRAMES.includes(timeframeParam as Timeframe)) {
    res.status(400).json({
      error: `timeframe must be one of: ${VALID_TIMEFRAMES.join(", ")}`,
    });
    return;
  }

  const timeframe = timeframeParam as Timeframe;

  const networks = parseList(req.query.networks, VALID_NETWORKS, ["ethereum"]);
  if (!networks) {
    res.status(400).json({
      error: `networks must be comma-separated list of: ${VALID_NETWORKS.join(", ")}`,
    });
    return;
  }
  const exchanges = parseList(req.query.exchanges, VALID_EXCHANGES, VALID_EXCHANGES);
  if (!exchanges) {
    res.status(400).json({
      error: `exchanges must be comma-separated list of: ${VALID_EXCHANGES.join(", ")}`,
    });
    return;
  }

  const sources = sourcesFor(networks, exchanges, "discovery");
  if (!sources.length) {
    res.status(400).json({ error: "None of the selected exchanges are available on the selected networks" });
    return;
  }

  // Check cache
  const cached = getCached(timeframe, networks, exchanges);
  if (cached) {
    const response: ApiResponse = {
      data: cached.data,
      meta: {
        timeframe,
        poolCount: cached.data.length,
        fetchedAt: cached.fetchedAt.toISOString(),
        errors: cached.errors,
      },
    };
    res.json(response);
    return;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const startTimestamp = now - timeframe * 24 * 60 * 60;

    // Every source in parallel. One failing -- a flaky indexer, a REST API
    // timing out -- must not blank the whole table, so failures are reported
    // beside the rows that did arrive rather than replacing them.
    const settled = await Promise.allSettled(
      sources.map((s) => fetchSource(s, timeframe, startTimestamp))
    );

    const computedPools: ComputedPool[] = [];
    const errors: { source: string; error: string }[] = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") {
        computedPools.push(...r.value);
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.error(`[pools] ${sources[i].key}: ${msg}`);
        errors.push({ source: `${sources[i].exchangeName} on ${sources[i].networkName}`, error: msg.slice(0, 200) });
      }
    });

    if (!computedPools.length && errors.length) {
      res.status(502).json({ error: "Every selected source failed", errors });
      return;
    }

    setCache(timeframe, networks, exchanges, computedPools, errors);

    const response: ApiResponse = {
      data: computedPools,
      meta: {
        timeframe,
        poolCount: computedPools.length,
        fetchedAt: new Date().toISOString(),
        errors: errors.length ? errors : undefined,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching pools:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;
