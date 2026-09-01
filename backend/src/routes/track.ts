import { Router, Request, Response } from "express";
import { VALID_NETWORKS, SNAPSHOT_POLL_INTERVAL_MS } from "../constants";
import { getTrackedPositions } from "../services/tracker";
import {
  addWatch, getHistory, listWatched, recordSnapshots, removeWatch,
} from "../services/history";
import { pollOnce } from "../services/poller";
import { TrackApiResponse } from "../types/track";

const router = Router();

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function parseNetworks(param: unknown): string[] | null {
  const raw = typeof param === "string" ? param : "";
  const networks = raw
    ? raw.split(",").map(n => n.trim().toLowerCase()).filter(Boolean)
    : [...VALID_NETWORKS];
  return networks.every(n => VALID_NETWORKS.includes(n)) ? networks : null;
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

// GET /api/track/watch — list every watched wallet
router.get("/watch", (_req: Request, res: Response) => {
  res.json({ data: listWatched() });
});

// POST /api/track/watch { address, networks } — start background polling
router.post("/watch", (req: Request, res: Response) => {
  const { address, networks } = req.body as { address?: string; networks?: string[] };
  if (!address || !ADDRESS_RE.test(address)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }
  const nets = Array.isArray(networks) && networks.length ? networks : [...VALID_NETWORKS];
  if (!nets.every(n => VALID_NETWORKS.includes(n))) {
    res.status(400).json({ error: `networks must be from: ${VALID_NETWORKS.join(", ")}` });
    return;
  }
  addWatch(address, nets);
  void pollOnce();   // start collecting right away rather than at the next tick
  res.json({ data: listWatched(address) });
});

// DELETE /api/track/watch/:address — stop polling (recorded history is kept)
router.delete("/watch/:address", (req: Request<{ address: string }>, res: Response) => {
  const { address } = req.params;
  if (!ADDRESS_RE.test(address)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }
  const nets = parseNetworks(req.query.networks);
  if (!nets) {
    res.status(400).json({ error: `networks must be from: ${VALID_NETWORKS.join(", ")}` });
    return;
  }
  removeWatch(address, typeof req.query.networks === "string" ? nets : undefined);
  res.json({ data: listWatched(address) });
});

// ── Positions ─────────────────────────────────────────────────────────────────

// GET /api/track/:address?networks=ethereum,arbitrum,base
router.get("/:address", async (req: Request<{ address: string }>, res: Response) => {
  const { address } = req.params;
  if (!ADDRESS_RE.test(address)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }

  const networks = parseNetworks(req.query.networks);
  if (!networks) {
    res.status(400).json({ error: `networks must be from: ${VALID_NETWORKS.join(", ")}` });
    return;
  }

  try {
    const results = await Promise.allSettled(
      networks.map(n => getTrackedPositions(n, address)),
    );
    const data = results.flatMap(r => (r.status === "fulfilled" ? r.value : []));
    if (results.every(r => r.status === "rejected")) {
      res.status(502).json({ error: "Position lookup failed on every network" });
      return;
    }

    // Every lookup is a free history point (debounced inside recordSnapshots)
    try {
      recordSnapshots(data);
      for (const p of data) p.history = getHistory(p.network, p.positionId);
    } catch (e) {
      console.error("History unavailable:", e instanceof Error ? e.message : e);
    }

    const watched = listWatched(address)
      .filter(w => networks.includes(w.network))
      .map(w => w.network);

    const response: TrackApiResponse = {
      data: data.sort((a, b) => b.positionValueUsd - a.positionValueUsd),
      meta: {
        address, networks,
        fetchedAt: new Date().toISOString(),
        watched,
        pollIntervalMinutes: Math.round(SNAPSHOT_POLL_INTERVAL_MS / 60_000),
      },
    };
    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e instanceof Error ? e.message : "Tracking failed" });
  }
});

export default router;
