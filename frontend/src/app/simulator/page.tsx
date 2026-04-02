"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PoolPreset, SimulationConfig, SimulationResult } from "@/types/simulator";
import { api } from "@/lib/api";
import ConfigPanel     from "@/components/simulator/ConfigPanel";
import MetricCards     from "@/components/simulator/MetricCards";
import RangeChart      from "@/components/simulator/RangeChart";
import ScenarioTable   from "@/components/simulator/ScenarioTable";
import PriceChart      from "@/components/simulator/PriceChart";
import Toast, { useToast } from "@/components/simulator/Toast";
import styles from "./page.module.css";

export default function SimulatorPage() {
  const [presets,  setPresets]  = useState<PoolPreset[]>([]);
  const [preset,   setPreset]   = useState<PoolPreset | null>(null);
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
        const ps = await api.getPresets();
        setPresets(ps);
        const defaultCfg = await api.getDefault(ps[0].id);
        setCfg(defaultCfg);
        setPreset(ps[0]);
        await simulate(defaultCfg);
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
  }, []);

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

  const m = result?.metrics;

  return (
    <div className={`${styles.shell} simulator-shell`}>

      {/* Header */}
      <header className={styles.hdr}>
        <span className={styles.hdrTitle}>LP Simulator</span>
        <span className={styles.hdrBadge}>
          <span className={styles.dot} />
          Uniswap V3
        </span>
        <span className={styles.hdrSep} />
        {preset && (
          <div className={styles.hdrPool}>
            <span className={styles.tokenPair}>
              <span className={styles.tIcon}>{preset.token0Symbol[0]}</span>
              <span className={styles.tIcon}>{preset.token1Symbol[0]}</span>
              {preset.token0Symbol} / {preset.token1Symbol}
            </span>
            <span className={styles.feeTag}>{preset.feeLabel}</span>
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
            token0Pct={m?.token0Pct ?? 0.5}
            token0Amount={m?.token0Amount ?? 0}
            token1Amount={m?.token1Amount ?? 0}
            token0ValueUsd={m?.token0ValueUsd ?? 0}
            token1ValueUsd={m?.token1ValueUsd ?? 0}
            onPresetSelect={handlePresetSelect}
            onChange={handleChange}
          />
        ) : (
          <div className={styles.cfgSkeleton} />
        )}

        {/* Main content */}
        <main className={styles.main}>
          {result && m && cfg ? (
            <>
              <MetricCards m={m} />
              <div className={styles.chartRow}>
                <PriceChart
                  candles={result.priceHistory}
                  cfg={cfg}
                  tvlHistory={result.tvlHistory}
                  aprHistory={result.aprHistory}
                  onChange={handleChange}
                />
                <div className={styles.rightCol}>
                  <RangeChart data={result.rangeChart} cfg={cfg} />
                  <ScenarioTable rows={result.scenarios} preset={result.preset} />
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
