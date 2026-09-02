// Remembers the last live pool opened in the simulator.
//
// The Simulator nav link used to point at a bare /simulator, which loads
// preset[0] -- a synthetic demo pool. That is the right landing page exactly
// once; after you have simulated a real pool, sending you back to fake price
// history to re-pick it is a step backwards. The link now resumes wherever
// you last were, and only falls back to the presets when there is no last.

const KEY = "defishack.lastsim.v1";

export interface LastSim {
  exchange?: string; // absent on entries written before multi-exchange support
  network: string;
  poolId:  string;
  label:   string;   // e.g. "WETH / USDT 0.3%" -- for the nav tooltip
  at:      number;   // epoch ms, so a stale entry can be judged later
}

export function loadLastSim(): LastSim | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LastSim;
    // Written by an older build, or hand-edited: treat anything without the
    // two fields the URL needs as absent rather than routing to a broken page.
    return v && typeof v.network === "string" && typeof v.poolId === "string" ? v : null;
  } catch {
    return null;
  }
}

export function saveLastSim(entry: Omit<LastSim, "at">): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...entry, at: Date.now() }));
    // Same-tab listeners: the storage event only fires in *other* tabs, so the
    // navbar would otherwise keep the link it read on mount.
    window.dispatchEvent(new Event("defishack:lastsim"));
  } catch {
    // storage blocked/full -- the link just keeps pointing at the presets
  }
}

export function lastSimHref(last: LastSim | null): string {
  if (!last) return "/simulator";
  const q = new URLSearchParams({ network: last.network, pool: last.poolId });
  if (last.exchange && last.exchange !== "uniswap-v3") q.set("exchange", last.exchange);
  return `/simulator?${q}`;
}
