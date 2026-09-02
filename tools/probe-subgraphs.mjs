// Probes candidate subgraphs before they are wired into constants.ts.
//
//   node tools/probe-subgraphs.mjs <dialect>:<exchange>/<network>=<id-or-url> ...
//   dialects: v3 | v4 | hyperswap | algebra
//
// Sends the four requests the discovery pipeline actually makes -- top pools
// with the native-token bundle, ticks for the top pool, its poolDayDatas and
// token0's tokenDayDatas -- as separate requests, the way the backend does.
// A combined query is rejected by some older graph-node deployments even
// though every individual request succeeds, so probing the combined form
// reports false failures. The API key is read from .env and never printed.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = readFileSync(path.join(HERE, "..", ".env"), "utf8");
const KEY = env.match(/^THE_GRAPH_API_KEY\s*=\s*(.+)$/m)?.[1].trim();
if (!KEY) { console.error("THE_GRAPH_API_KEY missing from .env"); process.exit(1); }
const gateway = (id) => `https://gateway.thegraph.com/api/${KEY}/subgraphs/id/${id}`;

// Field names that differ between forks. Everything else is identical.
const DIALECTS = {
  v3:        { fee: "feeTier", derived: "derivedETH",    bundlePrice: "ethPriceUSD" },
  v4:        { fee: "feeTier", derived: "derivedETH",    bundlePrice: "ethPriceUSD" },
  hyperswap: { fee: "feeTier", derived: "derivedNative", bundlePrice: "nativePriceUSD" },
  algebra:   { fee: "fee",     derived: "derivedMatic",  bundlePrice: "maticPriceUSD" },
};

async function gql(url, query) {
  const res = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(40_000),
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status} non-JSON: ${text.slice(0, 80)}`); }
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message.replace(/\s+/g, " ").slice(0, 120)).join(" | "));
  return body.data;
}

async function probe(label, target) {
  const [dialect, name] = label.split(":");
  const D = DIALECTS[dialect];
  if (!D) return `✗ ${label}: unknown dialect`;
  const url = target.startsWith("http") ? target : gateway(target);
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const out = [];
  let pool;
  try {
    const d = await gql(url, `{
      pools(first: 25, orderBy: totalValueLockedUSD, orderDirection: desc, where: { totalValueLockedUSD_gte: "1000000" }) {
        id ${D.fee} tick liquidity totalValueLockedUSD
        token0 { id symbol decimals ${D.derived} } token1 { id symbol decimals ${D.derived} }
      }
      bundle(id: "1") { ${D.bundlePrice} }
    }`);
    // Top-by-TVL is routinely a junk pool reporting trillions; the pipeline
    // drops those above its ceiling, so probe the first credible one instead.
    pool = d.pools.find((p) => +p.totalValueLockedUSD < 50e9) ?? d.pools[0];
    out.push(`pools=ok(${d.pools.length}, native=$${(+d.bundle?.[D.bundlePrice]).toFixed(0)})`);
  } catch (e) { return `✗ ${name.padEnd(22)} pools: ${e.message}`; }
  if (!pool) return `✗ ${name.padEnd(22)} pools: none above $1M`;

  try {
    const d = await gql(url, `{ ticks(first: 1000, orderBy: tickIdx, orderDirection: asc,
      where: { pool: "${pool.id}", tickIdx_gt: -887300, liquidityNet_not: "0" }) { tickIdx liquidityNet } }`);
    out.push(`ticks=ok(${d.ticks.length})`);
  } catch (e) { out.push(`ticks=FAIL(${e.message.slice(0, 60)})`); }

  try {
    const d = await gql(url, `{ poolDayDatas(first: 1000, where: { pool: "${pool.id}", date_gte: ${since} },
      orderBy: date, orderDirection: desc) { date feesUSD volumeUSD tvlUSD open close } }`);
    const newest = d.poolDayDatas[0];
    const ageH = newest ? Math.round((Date.now() / 1000 - newest.date) / 3600) : null;
    out.push(`days=ok(${d.poolDayDatas.length}, newest ${ageH}h old, ohlc=${newest?.open != null ? "y" : "n"})`);
  } catch (e) { out.push(`days=FAIL(${e.message.slice(0, 60)})`); }

  try {
    const d = await gql(url, `{ tokenDayDatas(first: 1000, where: { token: "${pool.token0.id}", date_gte: ${since} },
      orderBy: date, orderDirection: desc) { date priceUSD } }`);
    out.push(`tokenDays=ok(${d.tokenDayDatas.length})`);
  } catch (e) { out.push(`tokenDays=FAIL(${e.message.slice(0, 60)})`); }

  const top = `${pool.token0.symbol}/${pool.token1.symbol} ${pool[D.fee]} $${Math.round(+pool.totalValueLockedUSD).toLocaleString()}`;
  return `${out.some((s) => s.includes("FAIL")) ? "⚠" : "✓"} ${name.padEnd(22)} ${out.join("  ")}  top=${top}`;
}

const entries = process.argv.slice(2).map((a) => a.split("=", 2));
const results = await Promise.all(entries.map(([l, t]) => probe(l, t).catch((e) => `✗ ${l}: ${e.message}`)));
for (const r of results) console.log(r);
