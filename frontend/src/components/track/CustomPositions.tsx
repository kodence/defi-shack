"use client";

import { useCallback, useEffect, useState } from "react";
import { CustomPosition } from "@/types/custom";
import { api } from "@/lib/api";
import {
  collectCoingeckoIds, loadCustomPositions, newId, saveCustomPositions,
} from "@/lib/custom";
import CustomPositionCard from "./CustomPositionCard";

const num = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export default function CustomPositions() {
  const [positions, setPositions] = useState<CustomPosition[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [priceError, setPriceError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Create-form fields
  const [baseSym, setBaseSym] = useState("");
  const [baseCg, setBaseCg] = useState("");
  const [baseOverride, setBaseOverride] = useState("");
  const [quoteSym, setQuoteSym] = useState("");
  const [quoteCg, setQuoteCg] = useState("");
  const [quoteOverride, setQuoteOverride] = useState("");
  const [exchange, setExchange] = useState("");
  const [network, setNetwork] = useState("");
  const [feeTier, setFeeTier] = useState("");
  const [lower, setLower] = useState("");
  const [upper, setUpper] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const refreshPrices = useCallback(async (list: CustomPosition[]) => {
    const ids = collectCoingeckoIds(list.filter(p => p.status === "open"));
    if (!ids.length) return;
    try {
      const res = await api.prices(ids);
      setPrices(prev => ({ ...prev, ...res.prices }));
      setPriceError(null);
    } catch (e) {
      setPriceError(e instanceof Error ? e.message : "Price lookup failed");
    }
  }, []);

  useEffect(() => {
    const list = loadCustomPositions();
    setPositions(list);
    refreshPrices(list);
  }, [refreshPrices]);

  const persist = useCallback((next: CustomPosition[]) => {
    setPositions(next);
    saveCustomPositions(next);
  }, []);

  const update = useCallback((pos: CustomPosition) => {
    persist(loadCustomPositions().map(p => (p.id === pos.id ? pos : p)));
  }, [persist]);

  const remove = useCallback((id: string) => {
    persist(loadCustomPositions().filter(p => p.id !== id));
  }, [persist]);

  const create = () => {
    const lo = num(lower), hi = num(upper);
    if (!baseSym.trim() || !quoteSym.trim()) { setFormError("Both token symbols are required."); return; }
    if (!(lo > 0) || !(hi > lo)) { setFormError("Price range needs 0 < min < max (in quote per base — match your DEX orientation)."); return; }
    if (!baseCg.trim() && !(num(baseOverride) > 0)) { setFormError(`${baseSym.trim()} needs a CoinGecko id or a manual USD price.`); return; }
    if (!quoteCg.trim() && !(num(quoteOverride) > 0)) { setFormError(`${quoteSym.trim()} needs a CoinGecko id or a manual USD price.`); return; }

    const pos: CustomPosition = {
      id: newId(),
      createdAt: Date.now(),
      base: {
        symbol: baseSym.trim().toUpperCase(),
        coingeckoId: baseCg.trim().toLowerCase(),
        priceOverrideUsd: num(baseOverride) > 0 ? num(baseOverride) : null,
      },
      quote: {
        symbol: quoteSym.trim().toUpperCase(),
        coingeckoId: quoteCg.trim().toLowerCase(),
        priceOverrideUsd: num(quoteOverride) > 0 ? num(quoteOverride) : null,
      },
      exchange: exchange.trim(),
      network: network.trim(),
      feeTier: feeTier.trim() || "—",
      lowerPrice: lo,
      upperPrice: hi,
      interactions: [],
      checks: [],
      status: "open",
    };
    const next = [...positions, pos];
    persist(next);
    refreshPrices(next);
    setShowForm(false);
    setFormError(null);
    setBaseSym(""); setBaseCg(""); setBaseOverride("");
    setQuoteSym(""); setQuoteCg(""); setQuoteOverride("");
    setExchange(""); setNetwork(""); setFeeTier(""); setLower(""); setUpper("");
  };

  return (
    <div className="mt-6">
      <div className="is-flex is-align-items-center is-flex-wrap-wrap mb-2" style={{ gap: "1rem" }}>
        <h2 className="title is-4 mb-0">Custom positions</h2>
        <button className="button is-small is-primary is-outlined" onClick={() => setShowForm(v => !v)}>
          {showForm ? "Cancel" : "＋ Add custom position"}
        </button>
        {positions.length > 0 && (
          <button className="button is-small is-light" onClick={() => refreshPrices(positions)}>
            ↻ Refresh prices
          </button>
        )}
      </div>
      <p className="is-size-7 has-text-grey mb-3">
        For pools the wallet tracker can&apos;t see (other DEXes or chains). Copy values from your
        DEX and block explorer; current token prices come from CoinGecko ids, with manual
        overrides for anything CoinGecko doesn&apos;t list.
      </p>

      {priceError && (
        <div className="notification is-warning is-light py-2 px-3 is-size-7">
          {priceError} — stats fall back to manual price overrides where set.
        </div>
      )}

      {/* Create form (doc K step 1) */}
      {showForm && (
        <div className="box">
          <div className="columns is-multiline is-variable is-1">
            <div className="column is-2 py-1">
              <input className="input is-small" placeholder="Base symbol (ETH)" value={baseSym} onChange={e => setBaseSym(e.target.value)} />
            </div>
            <div className="column is-2 py-1">
              <input className="input is-small" placeholder="Base CoinGecko id (ethereum)" value={baseCg} onChange={e => setBaseCg(e.target.value)} />
            </div>
            <div className="column is-2 py-1">
              <input className="input is-small" type="number" step="any" placeholder="Base $ override (opt.)" value={baseOverride} onChange={e => setBaseOverride(e.target.value)} />
            </div>
            <div className="column is-2 py-1">
              <input className="input is-small" placeholder="Quote symbol (LDO)" value={quoteSym} onChange={e => setQuoteSym(e.target.value)} />
            </div>
            <div className="column is-2 py-1">
              <input className="input is-small" placeholder="Quote CoinGecko id (lido-dao)" value={quoteCg} onChange={e => setQuoteCg(e.target.value)} />
            </div>
            <div className="column is-2 py-1">
              <input className="input is-small" type="number" step="any" placeholder="Quote $ override (opt.)" value={quoteOverride} onChange={e => setQuoteOverride(e.target.value)} />
            </div>
            <div className="column is-2 py-1">
              <input className="input is-small" placeholder="Exchange (Orca)" value={exchange} onChange={e => setExchange(e.target.value)} />
            </div>
            <div className="column is-2 py-1">
              <input className="input is-small" placeholder="Network (Solana)" value={network} onChange={e => setNetwork(e.target.value)} />
            </div>
            <div className="column is-2 py-1">
              <input className="input is-small" placeholder="Fee tier (0.3%)" value={feeTier} onChange={e => setFeeTier(e.target.value)} />
            </div>
            <div className="column is-2 py-1">
              <input className="input is-small" type="number" step="any" placeholder="Min price (quote/base)" value={lower} onChange={e => setLower(e.target.value)} />
            </div>
            <div className="column is-2 py-1">
              <input className="input is-small" type="number" step="any" placeholder="Max price (quote/base)" value={upper} onChange={e => setUpper(e.target.value)} />
            </div>
            <div className="column is-2 py-1">
              <button className="button is-small is-primary is-fullwidth" onClick={create}>Create</button>
            </div>
          </div>
          {formError && <p className="has-text-danger is-size-7">{formError}</p>}
          <p className="is-size-7 has-text-grey">
            Double-check base/quote orientation matches your DEX (price = quote per 1 base).
            Then log your deposit on the new card.
          </p>
        </div>
      )}

      {positions.length === 0 && !showForm && (
        <div className="notification is-light">No custom positions yet.</div>
      )}

      <div className="columns is-multiline">
        {positions.map(p => (
          <div key={p.id} className="column is-half">
            <CustomPositionCard position={p} prices={prices} onUpdate={update} onDelete={remove} />
          </div>
        ))}
      </div>
    </div>
  );
}
