"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TrackedPosition } from "@/types/track";
import { api } from "@/lib/api";
import { formatUSD } from "@/utils/format";
import { NETWORKS } from "@/utils/constants";

const ADDR_KEY = "lpsim.track.address";
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(6);
}

function fmtAmount(v: number): string {
  if (v === 0) return "0";
  if (v < 0.001) return v.toFixed(6);
  if (v < 100) return v.toFixed(4);
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const SEVERITY_CLASS = { good: "is-success", warn: "is-warning", bad: "is-danger" } as const;

function RangeBar({ p }: { p: TrackedPosition }) {
  const span = p.upperPrice - p.lowerPrice;
  const pos = span > 0 ? Math.min(Math.max((p.currentPrice - p.lowerPrice) / span, 0), 1) : 0.5;
  return (
    <div>
      <div style={{
        position: "relative", height: "8px", borderRadius: "4px",
        background: p.inRange ? "#48c78e55" : "#f1466855", margin: "6px 0 2px",
      }}>
        <div style={{
          position: "absolute", left: `${pos * 100}%`, top: "-3px",
          width: "3px", height: "14px", borderRadius: "2px",
          background: p.inRange ? "#257953" : "#cc0f35", transform: "translateX(-50%)",
        }} />
      </div>
      <div className="is-flex is-justify-content-space-between is-size-7 has-text-grey">
        <span>{fmtPrice(p.lowerPrice)}</span>
        <span className="has-text-weight-semibold">{fmtPrice(p.currentPrice)} {p.quoteSymbol}/{p.baseSymbol}</span>
        <span>{fmtPrice(p.upperPrice)}</span>
      </div>
    </div>
  );
}

export default function TrackPage() {
  const [address, setAddress] = useState("");
  const [networks, setNetworks] = useState<string[]>(NETWORKS.map(n => n.key));
  const [positions, setPositions] = useState<TrackedPosition[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (addr: string, nets: string[]) => {
    if (!ADDRESS_RE.test(addr)) {
      setError("Enter a valid wallet address (0x…, 40 hex characters)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.track(addr, nets);
      setPositions(res.data);
      try { localStorage.setItem(ADDR_KEY, addr); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      setPositions(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ADDR_KEY);
      if (saved && ADDRESS_RE.test(saved)) {
        setAddress(saved);
        load(saved, NETWORKS.map(n => n.key));
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleNetwork = (key: string) => {
    setNetworks(prev =>
      prev.includes(key)
        ? prev.length > 1 ? prev.filter(n => n !== key) : prev
        : [...prev, key]);
  };

  return (
    <section className="section">
      <div className="container is-fluid">
        <h1 className="title is-3">Position Tracking</h1>
        <p className="subtitle is-6 has-text-grey">
          Live Uniswap V3 positions for any wallet — earnings, divergence loss, and vs-HODL benchmarks
        </p>

        {/* Lookup bar */}
        <div className="box">
          <div className="field has-addons mb-2" style={{ maxWidth: "560px" }}>
            <div className="control is-expanded">
              <input
                className="input"
                type="text"
                placeholder="Wallet address (0x…)"
                value={address}
                onChange={e => setAddress(e.target.value.trim())}
                onKeyDown={e => e.key === "Enter" && load(address, networks)}
              />
            </div>
            <div className="control">
              <button
                className={`button is-primary ${loading ? "is-loading" : ""}`}
                onClick={() => load(address, networks)}
              >
                Load positions
              </button>
            </div>
          </div>
          <div className="is-flex" style={{ gap: "1rem" }}>
            {NETWORKS.map(n => (
              <label key={n.key} className="checkbox is-size-7">
                <input
                  type="checkbox"
                  checked={networks.includes(n.key)}
                  onChange={() => toggleNetwork(n.key)}
                />{" "}
                {n.label}
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="notification is-danger is-light">{error}</div>
        )}

        {positions !== null && positions.length === 0 && !loading && (
          <div className="notification is-light">
            No active Uniswap V3 positions found for this wallet on the selected networks.
          </div>
        )}

        {positions !== null && positions.length > 0 && (
          <>
            <p className="is-size-7 has-text-grey mb-3">
              Earnings shown are <strong>unclaimed fees only</strong>, computed from on-chain fee
              growth — the subgraph&apos;s lifetime collected-fee data is unreliable and excluded, so
              vs-HODL is conservative for positions that already collected fees.
            </p>

            <div className="columns is-multiline">
              {positions.map(p => {
                const initial = p.benchmarks[0];
                const greens = p.benchmarks.filter(b => b.netUsd >= 0).length;
                return (
                  <div key={`${p.network}-${p.positionId}`} className="column is-half">
                    <div className="box" style={{ height: "100%" }}>
                      {/* Header */}
                      <div className="is-flex is-align-items-center is-flex-wrap-wrap mb-2" style={{ gap: "0.5rem" }}>
                        <strong className="is-size-5">{p.poolName}</strong>
                        <span className="tag is-warning is-light">{p.feeLabel}</span>
                        <span className="tag is-light">{p.networkName}</span>
                        <span className="tag is-light">#{p.positionId}</span>
                        <span className={`tag ${p.inRange ? "is-success" : "is-danger"}`}>
                          {p.inRange ? "In range" : "Out of range"}
                        </span>
                        <span className="ml-auto is-size-7 has-text-grey">
                          {p.daysHeld.toFixed(0)}d held
                        </span>
                      </div>

                      <RangeBar p={p} />

                      {/* Key metrics */}
                      <div className="columns is-mobile is-multiline mt-2 mb-0">
                        <div className="column is-one-third py-1">
                          <p className="heading mb-0">Value</p>
                          <p className="has-text-weight-bold">{formatUSD(p.positionValueUsd)}</p>
                          <p className="is-size-7 has-text-grey">
                            {fmtAmount(p.baseAmount)} {p.baseSymbol} + {fmtAmount(p.quoteAmount)} {p.quoteSymbol}
                          </p>
                        </div>
                        <div className="column is-one-third py-1">
                          <p className="heading mb-0">Unclaimed fees</p>
                          <p className="has-text-weight-bold has-text-success">{formatUSD(p.earnings.totalUsd)}</p>
                          <p className="is-size-7 has-text-grey">
                            fee APR ~{(p.aprSinceEntry * 100).toFixed(1)}% since entry
                          </p>
                        </div>
                        <div className="column is-one-third py-1">
                          <p className="heading mb-0">Net vs HODL</p>
                          <p className={`has-text-weight-bold ${p.netVsHodlUsd >= 0 ? "has-text-success" : "has-text-danger"}`}>
                            {formatUSD(p.netVsHodlUsd)}
                          </p>
                          <p className="is-size-7 has-text-grey">
                            DL {formatUSD(p.divergenceLossUsd)} · ER {(p.earningsRetention * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>

                      {/* Benchmarks (doc section L) */}
                      <table className="table is-fullwidth is-narrow is-size-7 mb-2">
                        <thead>
                          <tr>
                            <th>vs HODL benchmark</th>
                            <th className="has-text-right">Hodl value</th>
                            <th className="has-text-right">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.benchmarks.map(b => (
                            <tr key={b.label}>
                              <td>{b.label}{b === initial ? " (minimum bar)" : ""}</td>
                              <td className="has-text-right">{formatUSD(b.hodlValueUsd)}</td>
                              <td className={`has-text-right has-text-weight-semibold ${b.netUsd >= 0 ? "has-text-success" : "has-text-danger"}`}>
                                {b.netUsd >= 0 ? "+" : ""}{formatUSD(b.netUsd)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="is-size-7 has-text-grey mb-2">
                        {greens}/4 benchmarks green
                        {greens >= 3 ? " — outpacing most HODL options" : greens === 2 ? " — keep monitoring" : " — pool or range likely needs work"}
                        {p.entryApprox && " · entry prices approximated"}
                      </p>

                      {/* SMART flags */}
                      {p.smart.map((f, i) => (
                        <p key={i} className={`notification is-light py-2 px-3 mb-2 is-size-7 ${SEVERITY_CLASS[f.severity]}`}>
                          {f.message}
                        </p>
                      ))}

                      <Link
                        className="button is-small is-link is-outlined"
                        href={`/simulator?network=${p.network}&pool=${p.poolId}`}
                      >
                        Simulate this pool
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
