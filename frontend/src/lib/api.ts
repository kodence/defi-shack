import type { PoolPreset, SimulationConfig, SimulationResult, LivePoolDefault } from "@/types/simulator";
import type { TrackApiResponse } from "@/types/track";

const API_ROOT = "http://localhost:3001/api";
const BASE = `${API_ROOT}/simulator`;

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = path.startsWith("/api:") ? `${API_ROOT}${path.slice(5)}` : `${BASE}${path}`;
  const r = await fetch(url, {
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
  getLiveDefault:  (network: string, poolId: string, base?: 0 | 1) =>
    req<LivePoolDefault>("GET", `/pool/${network}/${poolId}/default${base !== undefined ? `?base=${base}` : ""}`),
  simulate:        (cfg: SimulationConfig)     => req<SimulationResult>   ("POST", "/simulate", cfg),
  // lite: charts stripped server-side — used by the portfolio page fan-out
  simulateLite:    (cfg: SimulationConfig)     => req<SimulationResult>   ("POST", "/simulate", { ...cfg, lite: true }),
  track:           (address: string, networks?: string[]) =>
    req<TrackApiResponse>("GET", `/api:/track/${address}${networks?.length ? `?networks=${networks.join(",")}` : ""}`),
  prices:          (ids: string[]) =>
    req<{ prices: Record<string, number>; fetchedAt: string }>("GET", `/api:/prices?ids=${ids.join(",")}`),
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
