// Prints the parts of a subgraph's schema the pipeline cares about, so a
// fork's renamed fields can be mapped rather than guessed at.
//
//   node tools/introspect-subgraph.mjs <label>=<subgraph-id-or-url> ...
//
// Reports the root query fields matching pool/tick/bundle/day/position, and
// the full field list of Pool, Tick, Bundle, Token, PoolDayData. The API key
// is read from .env and never printed.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = readFileSync(path.join(HERE, "..", ".env"), "utf8");
const KEY = env.match(/^THE_GRAPH_API_KEY\s*=\s*(.+)$/m)?.[1].trim();
if (!KEY) { console.error("THE_GRAPH_API_KEY missing from .env"); process.exit(1); }
const gateway = (id) => `https://gateway.thegraph.com/api/${KEY}/subgraphs/id/${id}`;

const TYPES = ["Pool", "Tick", "Bundle", "Token", "PoolDayData", "TokenDayData", "Position"];
const QUERY = `{
  __schema { queryType { fields { name } } }
  ${TYPES.map((t) => `${t}: __type(name: "${t}") { name fields { name type { name kind ofType { name } } } }`).join("\n")}
}`;

const typeName = (t) => t?.name ?? t?.ofType?.name ?? t?.kind ?? "?";

for (const arg of process.argv.slice(2)) {
  const [label, target] = arg.split("=", 2);
  const url = target.startsWith("http") ? target : gateway(target);
  console.log(`\n── ${label} ──`);
  let body;
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }), signal: AbortSignal.timeout(30_000),
    });
    body = await res.json();
  } catch (e) { console.log(`  network: ${e.message}`); continue; }
  if (body.errors?.length) { console.log("  " + body.errors.map((e) => e.message.slice(0, 160)).join("\n  ")); continue; }
  const d = body.data;
  const roots = d.__schema.queryType.fields.map((f) => f.name)
    .filter((n) => /pool|tick|bundle|day|position|factory|manager/i.test(n));
  console.log(`  query roots: ${roots.join(", ")}`);
  for (const t of TYPES) {
    const ty = d[t];
    if (!ty) { console.log(`  ${t}: (absent)`); continue; }
    console.log(`  ${t}: ${ty.fields.map((f) => `${f.name}:${typeName(f.type)}`).join(" ")}`);
  }
}
