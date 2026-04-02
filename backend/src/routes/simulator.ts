import { Router, Request, Response } from "express";
import { PRESETS, PRESET_MAP } from "../core/presets";
import { runSimulation } from "../core/simulation";
import { SimulationConfig } from "../core/types";

const router = Router();

// GET /api/simulator/presets
router.get("/presets", (_req: Request, res: Response) => {
  res.json(PRESETS);
});

// GET /api/simulator/presets/:id/default
router.get("/presets/:id/default", (req: Request<{ id: string }>, res: Response) => {
  const preset = PRESET_MAP.get(req.params.id);
  if (!preset) return res.status(404).json({ error: "Preset not found" });
  const pa = preset.defaultPrice * (1 - preset.defaultRangePct);
  const pb = preset.defaultPrice * (1 + preset.defaultRangePct);
  const cfg: SimulationConfig = {
    presetId: preset.id, currentPrice: preset.defaultPrice,
    volume24hUsd: preset.defaultVolume, lowerPrice: pa, upperPrice: pb,
    investmentUsd: 10_000,
  };
  return res.json(cfg);
});

// POST /api/simulator/simulate
router.post("/simulate", (req: Request, res: Response) => {
  const body = req.body as Partial<SimulationConfig>;

  if (!body.presetId || !PRESET_MAP.has(body.presetId))
    return res.status(400).json({ error: "Invalid or missing presetId" });
  if (!body.currentPrice || body.currentPrice <= 0)
    return res.status(400).json({ error: "currentPrice must be > 0" });
  if (!body.lowerPrice || !body.upperPrice || body.lowerPrice >= body.upperPrice)
    return res.status(400).json({ error: "lowerPrice must be < upperPrice" });
  if (!body.investmentUsd || body.investmentUsd <= 0)
    return res.status(400).json({ error: "investmentUsd must be > 0" });

  const cfg: SimulationConfig = {
    presetId:       body.presetId,
    currentPrice:   body.currentPrice,
    volume24hUsd:   Math.max(body.volume24hUsd ?? 0, 0),
    lowerPrice:     body.lowerPrice,
    upperPrice:     body.upperPrice,
    investmentUsd:  body.investmentUsd,
  };

  try {
    return res.json(runSimulation(cfg));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Simulation failed" });
  }
});

// GET /api/simulator/health
router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", ts: Date.now() });
});

export default router;
