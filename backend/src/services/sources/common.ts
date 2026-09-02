// Shared bits for the discovery adapters.

// Fee tiers are stored in hundredths of a basis point on every source here:
// 500 = 0.05%. Orca's feeRate and Algebra's dynamic fee use the same unit.
export function feeTierLabel(feeTier: number): string {
  return `${feeTier / 10000}%`;
}

export function poolLabel(sym0: string, sym1: string, feeTier: number): string {
  return `${sym0} / ${sym1} (${feeTierLabel(feeTier)})`;
}

// Coefficient of variation over a series, null when there is not enough of it
export function coefficientOfVariation(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return null;
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  if (mean <= 0) return null;
  const varr = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(varr) / mean;
}

// Fetch JSON with a timeout and one retry -- the REST sources are public
// endpoints that occasionally time out under load.
export async function getJson<T>(url: string, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr;
}

export async function mapWithConcurrency<T, R>(
  items: T[], concurrency: number, fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    out.push(...(await Promise.allSettled(batch.map(fn))));
  }
  return out;
}
