import { Router, Request, Response } from "express";
import { PRESETS, PRESET_MAP } from "../core/presets";
import { runSimulation } from "../core/simulation";
import { SimulationConfig, CalcMethod, DlScenarioInput } from "../core/types";
import {
  buildPresetContext, buildLiveContext, autoBaseToken, livePriceOriented, poolTypeOf,
} from "../core/context";
import { getPoolSnapshot } from "../services/poolSnapshot";
import { findSource } from "../constants";

const router = Router();

// An address, or a bytes32 PoolId on Uniswap V4
const POOL_ID_RE = /^0x(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/;
const CALC_METHODS: CalcMethod[] = ["current", "peak", "average", "custom"];
const VOLUME_WINDOWS = [7, 21, 30];

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : fallback;
};

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
    investmentUsd: 10_000, days: 90,
  };
  return res.json(cfg);
});

// GET /api/simulator/pool/:network/:poolId/default?base=0|1
router.get(
  "/pool/:network/:poolId/default",
  async (req: Request<{ network: string; poolId: string }>, res: Response) => {
    const network = req.params.network.toLowerCase();
    const poolId = req.params.poolId.toLowerCase();
    const exchange = String(req.query.exchange ?? "uniswap-v3").toLowerCase();
    const source = findSource(exchange, network);
    if (!source) return res.status(400).json({ error: "Unknown exchange or network" });
    if (!source.simulator)
      return res.status(400).json({ error: `Simulation is not available for ${source.exchangeName} on ${source.networkName}` });
    if (!POOL_ID_RE.test(poolId)) return res.status(400).json({ error: "Invalid pool address" });

    try {
      const snap = await getPoolSnapshot(exchange, network, poolId);
      const baseParam = req.query.base;
      const baseToken: 0 | 1 =
        baseParam === "0" ? 0 : baseParam === "1" ? 1 : autoBaseToken(snap);

      const priceO = livePriceOriented(snap, baseToken);
      if (!(priceO > 0)) return res.status(422).json({ error: "Could not determine pool price" });

      const base = baseToken === 0 ? snap.token0 : snap.token1;
      const quote = baseToken === 0 ? snap.token1 : snap.token0;
      const poolType = poolTypeOf(base.symbol, quote.symbol);
      const rangePct =
        poolType === "stable-stable" ? 0.005 :
        poolType === "crypto-stable" ? 0.15 : 0.10;

      const cfg: SimulationConfig = {
        exchange, network, poolId, baseToken,
        currentPrice: priceO,
        volume24hUsd: 0,
        lowerPrice: priceO * (1 - rangePct),
        upperPrice: priceO * (1 + rangePct),
        investmentUsd: 10_000,
        days: 90,
        calcMethod: "current",
        volumeWindow: 30,
        trimSpikes: true,
      };

      const ctx = buildLiveContext(cfg, snap);
      cfg.volume24hUsd = ctx.volume.avgUsd;
      return res.json({ config: cfg, pool: ctx.pool });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Failed to load pool";
      return res.status(502).json({ error: msg });
    }
  },
);

// POST /api/simulator/simulate
router.post("/simulate", async (req: Request, res: Response) => {
  const body = req.body as Partial<SimulationConfig>;

  const isLive = typeof body.poolId === "string" && typeof body.network === "string";
  if (!isLive && (!body.presetId || !PRESET_MAP.has(body.presetId)))
    return res.status(400).json({ error: "Invalid or missing presetId" });
  const exchange = String(body.exchange ?? "uniswap-v3").toLowerCase();
  if (isLive) {
    const source = findSource(exchange, String(body.network).toLowerCase());
    if (!source) return res.status(400).json({ error: "Unknown exchange or network" });
    if (!source.simulator)
      return res.status(400).json({ error: `Simulation is not available for ${source.exchangeName} on ${source.networkName}` });
    if (!POOL_ID_RE.test(String(body.poolId)))
      return res.status(400).json({ error: "Invalid pool address" });
  }
  if (!body.currentPrice || body.currentPrice <= 0)
    return res.status(400).json({ error: "currentPrice must be > 0" });
  if (!body.lowerPrice || !body.upperPrice || body.lowerPrice >= body.upperPrice)
    return res.status(400).json({ error: "lowerPrice must be < upperPrice" });
  if (!body.investmentUsd || body.investmentUsd <= 0)
    return res.status(400).json({ error: "investmentUsd must be > 0" });

  const dlScenarios: DlScenarioInput[] = (Array.isArray(body.dlScenarios) ? body.dlScenarios : [])
    .slice(0, 4)
    .filter(s => typeof s?.basePct === "number" && typeof s?.quotePct === "number")
    .map(s => ({
      basePct: Math.max(-0.95, Math.min(10, s.basePct)),
      quotePct: Math.max(-0.95, Math.min(10, s.quotePct)),
    }));

  const cfg: SimulationConfig = {
    presetId:       isLive ? undefined : body.presetId,
    exchange:       isLive ? exchange : undefined,
    network:        isLive ? String(body.network).toLowerCase() : undefined,
    poolId:         isLive ? String(body.poolId).toLowerCase() : undefined,
    baseToken:      body.baseToken === 1 ? 1 : body.baseToken === 0 ? 0 : undefined,
    currentPrice:   body.currentPrice,
    volume24hUsd:   Math.max(body.volume24hUsd ?? 0, 0),
    lowerPrice:     body.lowerPrice,
    upperPrice:     body.upperPrice,
    investmentUsd:  body.investmentUsd,
    days:           clampInt(body.days, 2, 365, 90),
    holdingDays:    body.holdingDays !== undefined ? clampInt(body.holdingDays, 1, 90, 7) : undefined,
    calcMethod:     CALC_METHODS.includes(body.calcMethod as CalcMethod)
                      ? (body.calcMethod as CalcMethod) : "current",
    customCalcPrice: typeof body.customCalcPrice === "number" && body.customCalcPrice > 0
                      ? body.customCalcPrice : undefined,
    volumeWindow:   VOLUME_WINDOWS.includes(Number(body.volumeWindow))
                      ? (Number(body.volumeWindow) as 7 | 21 | 30) : 30,
    trimSpikes:     body.trimSpikes !== false,
    dlScenarios,
  };

  // lite: strip the heavy chart arrays — used by the portfolio page, which only
  // needs metrics/divergence and may fan out one call per saved position
  const lite = (req.body as { lite?: boolean }).lite === true;
  const finish = (result: ReturnType<typeof runSimulation>) => {
    if (lite) {
      result.rangeChart = [];
      result.tvlHistory = [];
      result.priceHistory = [];
      result.aprHistory = { ...result.aprHistory, dailySamplesB: [] };
      result.liquidity = null;
    }
    return res.json(result);
  };

  try {
    if (isLive) {
      const snap = await getPoolSnapshot(cfg.exchange!, cfg.network!, cfg.poolId!);
      const ctx = buildLiveContext(cfg, snap);
      cfg.volume24hUsd = ctx.volume.avgUsd;
      return finish(runSimulation(cfg, ctx));
    }
    const preset = PRESET_MAP.get(cfg.presetId!)!;
    return finish(runSimulation(cfg, buildPresetContext(cfg, preset)));
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Simulation failed";
    return res.status(isLive ? 502 : 500).json({ error: msg });
  }
});

// GET /api/simulator/health
router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", ts: Date.now() });
});

export default router;
