import { Router, Request, Response } from "express";
import { VALID_NETWORKS } from "../constants";
import { getTrackedPositions } from "../services/tracker";
import { TrackApiResponse } from "../types/track";

const router = Router();

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// GET /api/track/:address?networks=ethereum,arbitrum,base
router.get("/:address", async (req: Request<{ address: string }>, res: Response) => {
  const address = req.params.address;
  if (!ADDRESS_RE.test(address)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }

  const param = typeof req.query.networks === "string" ? req.query.networks : "";
  const networks = param
    ? param.split(",").map(n => n.trim().toLowerCase()).filter(Boolean)
    : [...VALID_NETWORKS];
  for (const n of networks) {
    if (!VALID_NETWORKS.includes(n)) {
      res.status(400).json({ error: `networks must be from: ${VALID_NETWORKS.join(", ")}` });
      return;
    }
  }

  try {
    const results = await Promise.allSettled(
      networks.map(n => getTrackedPositions(n, address)),
    );
    const data = results.flatMap(r => (r.status === "fulfilled" ? r.value : []));
    const failed = networks.filter((_, i) => results[i].status === "rejected");
    if (failed.length === networks.length) {
      res.status(502).json({ error: "Position lookup failed on every network" });
      return;
    }
    const response: TrackApiResponse = {
      data: data.sort((a, b) => b.positionValueUsd - a.positionValueUsd),
      meta: { address, networks, fetchedAt: new Date().toISOString() },
    };
    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e instanceof Error ? e.message : "Tracking failed" });
  }
});

export default router;
