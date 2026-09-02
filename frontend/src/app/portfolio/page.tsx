"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SavedPosition, StressRow } from "@/types/portfolio";
import { api } from "@/lib/api";
import {
  loadPortfolio, savePortfolio, riskScore, riskGrade, backboneId, stressScenario,
} from "@/lib/portfolio";
import { formatUSD } from "@/utils/format";

const GRADE_CLASS = { A: "is-success", B: "is-warning", C: "is-danger" } as const;

export default function PortfolioPage() {
  const [positions, setPositions] = useState<SavedPosition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [movePct, setMovePct] = useState(-20);
  const [stress, setStress] = useState<Map<string, StressRow> | null>(null);
  const [stressRunning, setStressRunning] = useState(false);
  const debounces = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setPositions(loadPortfolio());
    setLoaded(true);
  }, []);

  const persist = useCallback((next: SavedPosition[]) => {
    setPositions(next);
    savePortfolio(next);
  }, []);

  const remove = useCallback((id: string) => {
    persist(positions.filter(p => p.id !== id));
    setStress(prev => {
      if (!prev) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, [positions, persist]);

  // ── Allocation edit: re-simulate that position with the new size ──────────
  const setInvestment = useCallback((id: string, usd: number) => {
    const clean = Math.max(usd, 1);
    setStress(null);   // stress results are per-allocation — force a re-run
    setPositions(prev => {
      const next = prev.map(p =>
        p.id === id ? { ...p, config: { ...p.config, investmentUsd: clean } } : p);
      savePortfolio(next);
      return next;
    });

    const timers = debounces.current;
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    timers.set(id, setTimeout(async () => {
      setRefreshing(prev => new Set(prev).add(id));
      try {
        const pos = loadPortfolio().find(p => p.id === id);
        if (!pos) return;
        const res = await api.simulateLite(pos.config);
        const a = res.aprBreakdown;
        setPositions(prev => {
          const next = prev.map(p => p.id === id ? {
            ...p,
            apr: res.metrics.estimatedApr,
            worstApr: a.worstCaseApr,
            dailyFeesUsd: res.metrics.dailyFeesUsd,
            depthRatio: a.fallbackUniform || a.realisticApr <= 0 ? p.depthRatio : a.worstCaseApr / a.realisticApr,
          } : p);
          savePortfolio(next);
          return next;
        });
      } catch {
        // metric refresh is best-effort; the stored snapshot stays
      } finally {
        setRefreshing(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }, 600));
  }, []);

  // ── Portfolio stress test (doc section I) ─────────────────────────────────
  const runStress = useCallback(async () => {
    setStressRunning(true);
    const move = movePct / 100;
    const rows = await Promise.all(positions.map(async (p): Promise<[string, StressRow]> => {
      try {
        const res = await api.simulateLite({ ...p.config, dlScenarios: [stressScenario(p, move)] });
        const custom = res.divergence.scenarios.find(s => s.source === "custom");
        return [p.id, {
          positionId: p.id,
          divergenceLossUsd: custom?.divergenceLossUsd ?? 0,
          positionValueUsd: custom?.positionValueUsd ?? p.config.investmentUsd,
          recoveryDays: custom?.recoveryDays ?? 0,
        }];
      } catch {
        return [p.id, {
          positionId: p.id, divergenceLossUsd: 0,
          positionValueUsd: p.config.investmentUsd, recoveryDays: 0, failed: true,
        }];
      }
    }));
    setStress(new Map(rows));
    setStressRunning(false);
  }, [positions, movePct]);

  // ── Aggregates ────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const capital = positions.reduce((s, p) => s + p.config.investmentUsd, 0);
    const daily = positions.reduce((s, p) => s + p.dailyFeesUsd, 0);
    const wApr = capital > 0
      ? positions.reduce((s, p) => s + p.apr * p.config.investmentUsd, 0) / capital
      : 0;
    return { capital, daily, wApr };
  }, [positions]);

  const stressTotals = useMemo(() => {
    if (!stress) return null;
    let dl = 0, value = 0, failed = 0;
    for (const p of positions) {
      const row = stress.get(p.id);
      if (!row) continue;
      if (row.failed) { failed++; continue; }
      dl += row.divergenceLossUsd;
      value += row.positionValueUsd;
    }
    const recovery = totals.daily > 0 ? Math.abs(Math.min(dl, 0)) / totals.daily : Infinity;
    return { dl, value, recovery, failed };
  }, [stress, positions, totals.daily]);

  const backbone = useMemo(() => backboneId(positions), [positions]);

  return (
    <section className="section">
      <div className="container is-fluid">
        <h1 className="title is-3">Portfolio Builder</h1>
        <p className="subtitle is-6 has-text-grey">
          Validated positions, allocations, and a portfolio-level stress test
        </p>

        {loaded && positions.length === 0 && (
          <div className="notification is-light">
            No saved positions yet. Open the <Link href="/simulator">Simulator</Link>, set up a
            position, and click <strong>＋ Add to portfolio</strong>.
          </div>
        )}

        {positions.length > 0 && (
          <>
            {/* Summary */}
            <nav className="level box mb-4">
              <div className="level-item has-text-centered">
                <div>
                  <p className="heading">Total capital</p>
                  <p className="title is-4">{formatUSD(totals.capital)}</p>
                </div>
              </div>
              <div className="level-item has-text-centered">
                <div>
                  <p className="heading">Weighted APR</p>
                  <p className="title is-4 has-text-success">{(totals.wApr * 100).toFixed(1)}%</p>
                </div>
              </div>
              <div className="level-item has-text-centered">
                <div>
                  <p className="heading">Est. daily fees</p>
                  <p className="title is-4">{formatUSD(totals.daily)}</p>
                </div>
              </div>
              <div className="level-item has-text-centered">
                <div>
                  <p className="heading">Est. monthly</p>
                  <p className="title is-4">{formatUSD(totals.daily * 30)}</p>
                </div>
              </div>
              <div className="level-item has-text-centered">
                <div>
                  <p className="heading">Positions</p>
                  <p className="title is-4">{positions.length}</p>
                </div>
              </div>
            </nav>

            {/* Positions table */}
            <div className="table-container">
              <table className="table is-fullwidth is-striped is-hoverable">
                <thead>
                  <tr>
                    <th>Pool</th>
                    <th>Network</th>
                    <th>Type</th>
                    <th title="Risk grade from volume consistency, DL recovery, correlation, depth, and TVL">Risk</th>
                    <th>Invested (USD)</th>
                    <th>APR</th>
                    <th>Worst-case</th>
                    <th>Daily fees</th>
                    {stress && <th title={`Market move ${movePct}%`}>Stress DL</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => {
                    const score = riskScore(p);
                    const grade = riskGrade(score);
                    const row = stress?.get(p.id);
                    const simHref = p.config.network && p.config.poolId
                      ? `/simulator?network=${p.config.network}&pool=${p.config.poolId}${p.config.exchange && p.config.exchange !== "uniswap-v3" ? `&exchange=${p.config.exchange}` : ""}`
                      : "/simulator";
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.poolName}</strong>
                          {p.id === backbone && (
                            <span className="tag is-link is-light ml-2" title="Best risk-adjusted position — portfolio backbone">
                              ★ Backbone
                            </span>
                          )}
                        </td>
                        <td>{p.networkName ?? "Preset"}</td>
                        <td className="is-size-7">{p.poolType}</td>
                        <td>
                          <span className={`tag ${GRADE_CLASS[grade]}`} title={`Score ${score}/100`}>
                            {grade} · {score}
                          </span>
                        </td>
                        <td style={{ maxWidth: "130px" }}>
                          <input
                            className="input is-small"
                            type="number" min="1" step="1000"
                            value={p.config.investmentUsd}
                            onChange={e => setInvestment(p.id, +e.target.value)}
                          />
                        </td>
                        <td className={refreshing.has(p.id) ? "has-text-grey" : "has-text-success"}>
                          {(p.apr * 100).toFixed(1)}%
                        </td>
                        <td>{(p.worstApr * 100).toFixed(1)}%</td>
                        <td>{formatUSD(p.dailyFeesUsd)}/d</td>
                        {stress && (
                          <td className={row && row.divergenceLossUsd < 0 ? "has-text-danger" : ""}>
                            {row?.failed ? "—" : row ? formatUSD(row.divergenceLossUsd) : "…"}
                          </td>
                        )}
                        <td>
                          <div className="buttons are-small is-flex-wrap-nowrap">
                            <Link className="button is-link is-outlined" href={simHref}>Open</Link>
                            <button className="button is-danger is-outlined" onClick={() => remove(p.id)}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Stress test */}
            <div className="box mt-4">
              <h2 className="title is-5 mb-2">Portfolio stress test</h2>
              <p className="is-size-7 has-text-grey mb-3">
                Applies a market-wide move to every non-stable asset across all positions and
                aggregates the divergence loss (stablecoins stay at $1).
              </p>
              <div className="is-flex is-align-items-center is-flex-wrap-wrap" style={{ gap: "1rem" }}>
                <input
                  type="range" min="-50" max="50" step="5"
                  value={movePct}
                  onChange={e => setMovePct(+e.target.value)}
                  style={{ width: "260px" }}
                />
                <span className={`tag is-medium ${movePct < 0 ? "is-danger is-light" : "is-success is-light"}`}>
                  Market {movePct >= 0 ? "+" : ""}{movePct}%
                </span>
                <button
                  className={`button is-primary is-small ${stressRunning ? "is-loading" : ""}`}
                  onClick={runStress}
                >
                  Run stress test
                </button>
              </div>

              {stressTotals && (
                <div className="mt-4">
                  <div className="columns">
                    <div className="column">
                      <p className="heading">Total divergence loss</p>
                      <p className={`title is-5 ${stressTotals.dl < 0 ? "has-text-danger" : "has-text-success"}`}>
                        {formatUSD(stressTotals.dl)}
                      </p>
                    </div>
                    <div className="column">
                      <p className="heading">Portfolio value after move</p>
                      <p className="title is-5">{formatUSD(stressTotals.value)}</p>
                    </div>
                    <div className="column">
                      <p className="heading">Recovery at current fees</p>
                      <p className="title is-5">
                        {isFinite(stressTotals.recovery) ? `${stressTotals.recovery.toFixed(1)} days` : "∞"}
                      </p>
                    </div>
                  </div>
                  {stressTotals.failed > 0 && (
                    <p className="is-size-7 has-text-danger">
                      {stressTotals.failed} position(s) could not be stress-tested (backend error).
                    </p>
                  )}
                  <p className="is-size-7 has-text-grey">
                    A portfolio that recovers its stress-move divergence loss within a couple of
                    weeks of fees is resilient enough to hold through volatility (doc section I).
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
