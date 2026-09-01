"use client";

import { useState } from "react";
import { CustomCheck, CustomInteraction, CustomPosition, InteractionType } from "@/types/custom";
import { computeStats } from "@/lib/custom";
import { formatUSD } from "@/utils/format";

interface Props {
  position: CustomPosition;
  prices:   Record<string, number>;
  onUpdate: (next: CustomPosition) => void;
  onDelete: (id: string) => void;
}

type FormMode = "none" | "check" | InteractionType;

const usd = (v: number | null) => (v === null ? "—" : formatUSD(v));
const fmtP = (v: number) =>
  v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
  : v >= 1 ? v.toFixed(4) : v.toFixed(6);

function toLocalInput(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): number {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : Math.floor(Date.now() / 1000);
}

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function CustomPositionCard({ position: p, prices, onUpdate, onDelete }: Props) {
  const [mode, setMode] = useState<FormMode>("none");
  // Shared form fields (interpreted per mode)
  const [aBase, setABase] = useState("");
  const [aQuote, setAQuote] = useState("");
  const [fBase, setFBase] = useState("");   // check: unclaimed base
  const [fQuote, setFQuote] = useState(""); // check: unclaimed quote
  const [usdVal, setUsdVal] = useState("");
  const [gas, setGas] = useState("");
  const [poolPrice, setPoolPrice] = useState("");
  const [when, setWhen] = useState(toLocalInput(Math.floor(Date.now() / 1000)));

  const stats = computeStats(p, prices);
  const hasDeposit = p.interactions.some(i => i.type === "deposit");
  const closed = p.status === "closed";

  const openForm = (m: FormMode) => {
    setABase(""); setAQuote(""); setFBase(""); setFQuote("");
    setUsdVal(""); setGas(""); setPoolPrice("");
    setWhen(toLocalInput(Math.floor(Date.now() / 1000)));
    setMode(prev => (prev === m ? "none" : m));
  };

  const submit = () => {
    if (mode === "none") return;
    if (mode === "check") {
      const check: CustomCheck = {
        ts: fromLocalInput(when),
        amountBase: num(aBase), amountQuote: num(aQuote),
        unclaimedBase: num(fBase), unclaimedQuote: num(fQuote),
        poolPrice: num(poolPrice),
      };
      if (check.poolPrice <= 0) return;
      onUpdate({ ...p, checks: [...p.checks, check].sort((a, b) => a.ts - b.ts) });
    } else {
      const it: CustomInteraction = {
        type: mode,
        ts: fromLocalInput(when),
        amountBase: num(aBase), amountQuote: num(aQuote),
        usdValue: num(usdVal), gasUsd: num(gas),
      };
      if (mode !== "claim" && it.amountBase <= 0 && it.amountQuote <= 0) return;
      onUpdate({
        ...p,
        interactions: [...p.interactions, it].sort((a, b) => a.ts - b.ts),
        status: mode === "withdraw" ? "closed" : p.status,
      });
    }
    setMode("none");
  };

  const check = stats.latestCheck;
  const span = p.upperPrice - p.lowerPrice;
  const rangePos = check && span > 0
    ? Math.min(Math.max((check.poolPrice - p.lowerPrice) / span, 0), 1)
    : null;

  return (
    <div className="box" style={{ height: "100%" }}>
      {/* Header */}
      <div className="is-flex is-align-items-center is-flex-wrap-wrap mb-2" style={{ gap: "0.5rem" }}>
        <strong className="is-size-5">{p.base.symbol} / {p.quote.symbol}</strong>
        <span className="tag is-warning is-light">{p.feeTier}</span>
        {p.exchange && <span className="tag is-light">{p.exchange}</span>}
        {p.network && <span className="tag is-light">{p.network}</span>}
        <span className={`tag ${closed ? "is-dark" : "is-info"}`}>{closed ? "Closed" : "Custom"}</span>
        {!closed && stats.inRange !== null && (
          <span className={`tag ${stats.inRange ? "is-success" : "is-danger"}`}>
            {stats.inRange ? "In range" : "Out of range"}
          </span>
        )}
      </div>

      {/* Range bar */}
      {!closed && (
        <div className="mb-2">
          <div style={{
            position: "relative", height: "8px", borderRadius: "4px",
            background: stats.inRange === false ? "#f1466855" : "#48c78e55", margin: "6px 0 2px",
          }}>
            {rangePos !== null && (
              <div style={{
                position: "absolute", left: `${rangePos * 100}%`, top: "-3px",
                width: "3px", height: "14px", borderRadius: "2px",
                background: stats.inRange === false ? "#cc0f35" : "#257953",
                transform: "translateX(-50%)",
              }} />
            )}
          </div>
          <div className="is-flex is-justify-content-space-between is-size-7 has-text-grey">
            <span>{fmtP(p.lowerPrice)}</span>
            <span className="has-text-weight-semibold">
              {check ? `${fmtP(check.poolPrice)} ${p.quote.symbol}/${p.base.symbol}` : "no check yet"}
            </span>
            <span>{fmtP(p.upperPrice)}</span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="columns is-mobile is-multiline mb-0">
        <div className="column is-one-third py-1">
          <p className="heading mb-0">Value</p>
          <p className="has-text-weight-bold">{usd(stats.positionValueUsd)}</p>
        </div>
        <div className="column is-one-third py-1">
          <p className="heading mb-0">Earnings</p>
          <p className="has-text-weight-bold has-text-success">{usd(stats.earningsUsd)}</p>
          <p className="is-size-7 has-text-grey">
            {formatUSD(stats.claimedUsd)} claimed{stats.unclaimedUsd !== null ? ` + ${formatUSD(stats.unclaimedUsd)} unclaimed` : ""}
          </p>
        </div>
        <div className="column is-one-third py-1">
          <p className="heading mb-0">Net vs HODL</p>
          <p className={`has-text-weight-bold ${(stats.netVsHodlUsd ?? 0) >= 0 ? "has-text-success" : "has-text-danger"}`}>
            {usd(stats.netVsHodlUsd)}
          </p>
          <p className="is-size-7 has-text-grey">DL {usd(stats.divergenceLossUsd)}</p>
        </div>
        <div className="column is-one-third py-1">
          <p className="heading mb-0">Overall P/L</p>
          <p className={`has-text-weight-bold ${(stats.overallPnlUsd ?? 0) >= 0 ? "has-text-success" : "has-text-danger"}`}>
            {usd(stats.overallPnlUsd)}
          </p>
          <p className="is-size-7 has-text-grey">incl. {formatUSD(stats.gasUsd)} gas</p>
        </div>
        <div className="column is-one-third py-1">
          <p className="heading mb-0">Fee APR</p>
          <p className="has-text-weight-bold">
            {stats.aprSinceEntry === null || stats.daysHeld < 1
              ? "—"
              : `${(stats.aprSinceEntry * 100).toFixed(1)}%`}
          </p>
          <p className="is-size-7 has-text-grey">
            {stats.daysHeld < 1 ? "needs ≥1 day of history" : `${stats.daysHeld.toFixed(0)}d held`}
          </p>
        </div>
        <div className="column is-one-third py-1">
          <p className="heading mb-0">Deposited</p>
          <p className="has-text-weight-bold">{formatUSD(stats.depositUsd)}</p>
          {stats.withdrawnUsd > 0 && (
            <p className="is-size-7 has-text-grey">{formatUSD(stats.withdrawnUsd)} withdrawn</p>
          )}
        </div>
      </div>

      {(stats.basePriceUsd === null || stats.quotePriceUsd === null) && (
        <p className="notification is-warning is-light py-2 px-3 is-size-7 mb-2">
          Missing a current USD price — check the CoinGecko ids or set a manual price override.
        </p>
      )}
      {!hasDeposit && !closed && (
        <p className="notification is-info is-light py-2 px-3 is-size-7 mb-2">
          Log your deposit (amounts, USD value, gas) to unlock P/L analytics.
        </p>
      )}

      {/* Actions */}
      {!closed && (
        <div className="buttons are-small mb-2">
          <button className={`button is-link ${mode === "check" ? "" : "is-outlined"}`} onClick={() => openForm("check")}>Log check</button>
          <button className={`button ${mode === "deposit" ? "is-link" : ""}`} onClick={() => openForm("deposit")}>Deposit</button>
          <button className={`button ${mode === "claim" ? "is-link" : ""}`} onClick={() => openForm("claim")}>Claim</button>
          <button className={`button ${mode === "withdraw" ? "is-link" : ""}`} onClick={() => openForm("withdraw")}>Withdraw</button>
          <button className="button is-danger is-outlined" style={{ marginLeft: "auto" }} onClick={() => onDelete(p.id)}>Delete</button>
        </div>
      )}
      {closed && (
        <div className="buttons are-small mb-2">
          <button className="button is-danger is-outlined" onClick={() => onDelete(p.id)}>Delete</button>
        </div>
      )}

      {/* Inline form */}
      {mode !== "none" && (
        <div className="p-3" style={{ background: "#f6f8fa", borderRadius: "6px" }}>
          <p className="is-size-7 has-text-weight-semibold mb-2">
            {mode === "check" && "Performance check — copy live values from your DEX position page"}
            {mode === "deposit" && "Log a deposit — exact amounts + USD value + gas from the explorer"}
            {mode === "claim" && "Record a fee claim — amounts received + USD value at claim"}
            {mode === "withdraw" && "Record a withdrawal — closes the position"}
          </p>
          <div className="columns is-mobile is-multiline is-variable is-1">
            <div className="column is-half py-1">
              <input className="input is-small" type="number" step="any" placeholder={`${p.base.symbol} amount`}
                value={aBase} onChange={e => setABase(e.target.value)} />
            </div>
            <div className="column is-half py-1">
              <input className="input is-small" type="number" step="any" placeholder={`${p.quote.symbol} amount`}
                value={aQuote} onChange={e => setAQuote(e.target.value)} />
            </div>
            {mode === "check" && (
              <>
                <div className="column is-half py-1">
                  <input className="input is-small" type="number" step="any" placeholder={`Unclaimed ${p.base.symbol}`}
                    value={fBase} onChange={e => setFBase(e.target.value)} />
                </div>
                <div className="column is-half py-1">
                  <input className="input is-small" type="number" step="any" placeholder={`Unclaimed ${p.quote.symbol}`}
                    value={fQuote} onChange={e => setFQuote(e.target.value)} />
                </div>
                <div className="column is-half py-1">
                  <input className="input is-small" type="number" step="any"
                    placeholder={`Pool price (${p.quote.symbol}/${p.base.symbol})`}
                    value={poolPrice} onChange={e => setPoolPrice(e.target.value)} />
                </div>
              </>
            )}
            {mode !== "check" && (
              <>
                <div className="column is-half py-1">
                  <input className="input is-small" type="number" step="any" placeholder="Total USD value"
                    value={usdVal} onChange={e => setUsdVal(e.target.value)} />
                </div>
                <div className="column is-half py-1">
                  <input className="input is-small" type="number" step="any" placeholder="Gas (USD)"
                    value={gas} onChange={e => setGas(e.target.value)} />
                </div>
              </>
            )}
            <div className="column is-half py-1">
              <input className="input is-small" type="datetime-local"
                value={when} onChange={e => setWhen(e.target.value)} />
            </div>
            <div className="column is-half py-1">
              <button className="button is-small is-primary is-fullwidth" onClick={submit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {(p.interactions.length > 0 || p.checks.length > 0) && (
        <details className="is-size-7 mt-2">
          <summary className="has-text-grey" style={{ cursor: "pointer" }}>
            History · {p.interactions.length} interaction(s), {p.checks.length} check(s)
          </summary>
          <ul className="mt-1">
            {[...p.interactions.map(i => ({
              ts: i.ts,
              text: `${i.type} — ${i.amountBase} ${p.base.symbol} + ${i.amountQuote} ${p.quote.symbol} (${formatUSD(i.usdValue)}, gas ${formatUSD(i.gasUsd)})`,
            })), ...p.checks.map(c => ({
              ts: c.ts,
              text: `check — ${c.amountBase} ${p.base.symbol} + ${c.amountQuote} ${p.quote.symbol}, unclaimed ${c.unclaimedBase}/${c.unclaimedQuote}, price ${fmtP(c.poolPrice)}`,
            }))].sort((a, b) => a.ts - b.ts).map((h, i) => (
              <li key={i}>
                <span className="has-text-grey">{new Date(h.ts * 1000).toLocaleString()}</span> · {h.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
