"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PoolPreset, SimPoolInfo, SimulationConfig, SimulationResult } from "@/types/simulator";
import { api } from "@/lib/api";
import ConfigPanel     from "@/components/simulator/ConfigPanel";
import MetricCards     from "@/components/simulator/MetricCards";
import RangeChart      from "@/components/simulator/RangeChart";
import ScenarioTable   from "@/components/simulator/ScenarioTable";
import PriceChart      from "@/components/simulator/PriceChart";
import LiquidityChart  from "@/components/simulator/LiquidityChart";
import DivergencePanel from "@/components/simulator/DivergencePanel";
import Toast, { useToast } from "@/components/simulator/Toast";
import styles from "./page.module.css";

function SimulatorInner() {
  const params = useSearchParams();
  const liveNetwork = params.get("network");
  const livePoolId  = params.get("pool");
  const isLiveTarget = Boolean(liveNetwork && livePoolId);

  const [presets,  setPresets]  = useState<PoolPreset[]>([]);
  const [preset,   setPreset]   = useState<PoolPreset | null>(null);
  const [pool,     setPool]     = useState<SimPoolInfo | null>(null);
  const [cfg,      setCfg]      = useState<SimulationConfig | null>(null);
  const [result,   setResult]   = useState<SimulationResult | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [toasts,   pushToast]   = useToast();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Simulate ──────────────────────────────────────────────────────────────
  const simulate = useCallback(async (config: SimulationConfig) => {
    if (config.lowerPrice >= config.upperPrice) return;
    setLoading(true);
    try {
      const res = await api.simulate(config);
      setResult(res);
      setPool(res.pool);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Simulation failed", true);
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  const scheduleSimulate = useCallback((config: SimulationConfig) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => simulate(config), 320);
  }, [simulate]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        if (isLiveTarget) {
          const { config, pool: poolInfo } = await api.getLiveDefault(liveNetwork!, livePoolId!);
          setPool(poolInfo);
          setCfg(config);
          await simulate(config);
          // Presets stay available for quick comparison
          api.getPresets().then(setPresets).catch(() => {});
        } else {
          const ps = await api.getPresets();
          setPresets(ps);
          const defaultCfg = await api.getDefault(ps[0].id);
          setCfg(defaultCfg);
          setPreset(ps[0]);
          await simulate(defaultCfg);
        }
      } catch (e) {
        pushToast(
          (e instanceof Error ? e.message : "Backend error") +
          " — is the Express server running on :3001?",
          true,
        );
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveNetwork, livePoolId]);

  // ── Preset change ─────────────────────────────────────────────────────────
  const handlePresetSelect = useCallback(async (p: PoolPreset) => {
    setPreset(p);
    try {
      const defaultCfg = await api.getDefault(p.id);
      setCfg(defaultCfg);
      scheduleSimulate(defaultCfg);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Preset load failed", true);
    }
  }, [scheduleSimulate, pushToast]);

  // ── Config patch ──────────────────────────────────────────────────────────
  const handleChange = useCallback((patch: Partial<SimulationConfig>) => {
    setCfg(prev => {
      if (!prev) return prev;
      const p = prev.currentPrice;
      const lo = patch.lowerPrice ?? prev.lowerPrice;
      const hi = patch.upperPrice ?? prev.upperPrice;
      const next: SimulationConfig = {
        ...prev,
        ...patch,
        currentPrice:   Math.max(patch.currentPrice   ?? p,               1e-9),
        investmentUsd:  Math.max(patch.investmentUsd  ?? prev.investmentUsd,  1),
        volume24hUsd:   Math.max(patch.volume24hUsd   ?? prev.volume24hUsd,   0),
        lowerPrice:     Math.max(lo, 1e-12),
        upperPrice:     hi > lo ? hi : lo * 1.0001,
      };
      scheduleSimulate(next);
      return next;
    });
  }, [scheduleSimulate]);

  // ── Base/quote flip: invert all oriented prices client-side ───────────────
  const handleInvert = useCallback(() => {
    setCfg(prev => {
      if (!prev || prev.baseToken === undefined) return prev;
      const next: SimulationConfig = {
        ...prev,
        baseToken:    prev.baseToken === 0 ? 1 : 0,
        currentPrice: 1 / prev.currentPrice,
        lowerPrice:   1 / prev.upperPrice,
        upperPrice:   1 / prev.lowerPrice,
        customCalcPrice: prev.customCalcPrice ? 1 / prev.customCalcPrice : undefined,
      };
      scheduleSimulate(next);
      return next;
    });
  }, [scheduleSimulate]);

  const m = result?.metrics;

  return (
    <div className={`${styles.shell} simulator-shell`}>

      {/* Header */}
      <header className={styles.hdr}>
        <span className={styles.hdrTitle}>LP Simulator</span>
        <span className={styles.hdrBadge}>
          <span className={styles.dot} />
          {pool?.source === "live" ? `Uniswap V3 · ${pool.networkName ?? ""} · live` : "Uniswap V3"}
        </span>
        <span className={styles.hdrSep} />
        {pool && (
          <div className={styles.hdrPool}>
            <span className={styles.tokenPair}>
              <span className={styles.tIcon}>{pool.baseSymbol[0]}</span>
              <span className={styles.tIcon}>{pool.quoteSymbol[0]}</span>
              {pool.baseSymbol} / {pool.quoteSymbol}
            </span>
            <span className={styles.feeTag}>{pool.feeLabel}</span>
          </div>
        )}
        {loading && <span className={styles.spinner} />}
      </header>

      {/* Body */}
      <div className={styles.body}>

        {/* Config panel */}
        {cfg ? (
          <ConfigPanel
            presets={presets}
            cfg={cfg}
            activePreset={preset}
            pool={pool}
            aprBreakdown={result?.aprBreakdown ?? null}
            basePct={m?.basePct ?? 0.5}
            baseAmount={m?.baseAmount ?? 0}
            quoteAmount={m?.quoteAmount ?? 0}
            baseValueUsd={m?.baseValueUsd ?? 0}
            quoteValueUsd={m?.quoteValueUsd ?? 0}
            onPresetSelect={handlePresetSelect}
            onChange={handleChange}
            onInvert={handleInvert}
          />
        ) : (
          <div className={styles.cfgSkeleton} />
        )}

        {/* Main content */}
        <main className={styles.main}>
          {result && m && cfg && pool ? (
            <>
              <MetricCards m={m} apr={result.aprBreakdown} />
              <div className={styles.chartRow}>
                <div className={styles.leftCol}>
                  <PriceChart
                    candles={result.priceHistory}
                    cfg={cfg}
                    live={pool.source === "live"}
                    tvlHistory={result.tvlHistory}
                    aprHistory={result.aprHistory}
                    onChange={handleChange}
                  />
                  {result.liquidity && (
                    <LiquidityChart data={result.liquidity} cfg={cfg} pool={pool} />
                  )}
                </div>
                <div className={styles.rightCol}>
                  <RangeChart data={result.rangeChart} cfg={cfg} />
                  <ScenarioTable rows={result.scenarios} pool={pool} />
                  <DivergencePanel
                    data={result.divergence}
                    pool={pool}
                    cfg={cfg}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className={styles.skeleton}>
              <div className={styles.skRow4} />
              <div className={styles.skHalf2} />
            </div>
          )}
        </main>
      </div>

      <Toast messages={toasts} onDismiss={() => {}} />
    </div>
  );
}

export default function SimulatorPage() {
  return (
    <Suspense fallback={<div className={styles.loadingMsg}>Loading simulator…</div>}>
      <SimulatorInner />
    </Suspense>
  );
}
