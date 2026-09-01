import { Router, Request, Response } from "express";

// Proxy for CoinGecko simple prices — custom positions reference tokens by
// CoinGecko API id (per the doc's flow), which may not exist on our subgraphs.
// Cached per id so repeated checks stay polite to the free API.

const router = Router();

const ID_RE = /^[a-z0-9-]{1,64}$/;
const MAX_IDS = 20;
const PRICE_TTL_MS = 60_000;

const cache = new Map<string, { usd: number; at: number }>();

router.get("/", async (req: Request, res: Response) => {
  const raw = typeof req.query.ids === "string" ? req.query.ids : "";
  const ids = [...new Set(raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean))];
  if (!ids.length || ids.length > MAX_IDS || ids.some(id => !ID_RE.test(id))) {
    res.status(400).json({ error: `ids must be 1–${MAX_IDS} CoinGecko ids (lowercase, a-z0-9-)` });
    return;
  }

  const now = Date.now();
  const prices: Record<string, number> = {};
  const missing: string[] = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && now - hit.at < PRICE_TTL_MS) prices[id] = hit.usd;
    else missing.push(id);
  }

  if (missing.length) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${missing.join(",")}&vs_currencies=usd`;
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`CoinGecko responded ${r.status}`);
      const json = (await r.json()) as Record<string, { usd?: number }>;
      for (const id of missing) {
        const usd = json[id]?.usd;
        if (typeof usd === "number" && usd > 0) {
          prices[id] = usd;
          cache.set(id, { usd, at: now });
        }
      }
    } catch (e) {
      // Serve whatever the cache had; unknown ids simply stay absent
      console.error("CoinGecko fetch failed:", e instanceof Error ? e.message : e);
      if (!Object.keys(prices).length) {
        res.status(502).json({ error: "Price lookup failed — use manual price overrides" });
        return;
      }
    }
  }

  res.json({ prices, fetchedAt: new Date().toISOString() });
});

export default router;
