import type { PoolPreset, SimulationConfig, SimulationResult } from "@/types/simulator";

const BASE = "http://localhost:3001/api/simulator";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(e.error ?? r.statusText);
  }
  return r.json();
}

export const api = {
  getPresets:      ()                          => req<PoolPreset[]>       ("GET",  "/presets"),
  getDefault:      (id: string)                => req<SimulationConfig>   ("GET",  `/presets/${id}/default`),
  simulate:        (cfg: SimulationConfig)     => req<SimulationResult>   ("POST", "/simulate", cfg),
};

// ── Formatting ──────────────────────────────────────────────────────────────
export function fmtUsd(v: number, dec = 2): string {
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1_000)     return `${s}$${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `${s}$${a.toFixed(dec)}`;
}
export function fmtPct(frac: number, dec = 2): string {
  const p = frac * 100, s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(dec)}%`;
}
export function fmtX(v: number): string { return `${v.toFixed(1)}x`; }
export function fmtPrice(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (v >= 1)    return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}
export function fmtVolShort(v: number): string {
  return v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M/d` : `$${(v / 1e3).toFixed(0)}K/d`;
}
