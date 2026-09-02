# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run both servers concurrently (from repo root)
npm run dev

# Run individually
npm run dev:backend    # Express on http://localhost:3001 (tsx watch, auto-reloads)
npm run dev:frontend   # Next.js on http://localhost:3000 (Turbopack)

# Stop everything `npm run dev` started
npm run dev:stop       # tree-kills the dev processes and frees 3000/3001

# Probe a candidate subgraph with the pipeline's own four requests before
# wiring it into constants.ts (dialects: v3 | v4 | hyperswap | algebra)
node tools/probe-subgraphs.mjs v3:uniswap-v3/polygon=<subgraph-id>
node tools/introspect-subgraph.mjs label=<subgraph-id-or-url>   # field names

# Build
cd backend && npm run build    # tsc → dist/
cd frontend && npm run build   # next build

# Install all dependencies (root + both packages)
npm install && cd backend && npm install && cd ../frontend && npm install
```

No test runner or linter is configured.

## Architecture

Monorepo with two independent TypeScript packages (`backend/`, `frontend/`) orchestrated by root `package.json` via `concurrently`.

### Data flow

```
One source per (exchange, network) -- see SOURCES in constants.ts:
  V3-schema subgraphs on The Graph (4 dialects) | Messari-schema subgraphs |
  PancakeSwap explorer API | Orca REST API
  → backend fans out over every source matching networks × exchanges
  → each adapter yields ComputedPool rows (metrics it cannot derive are null)
  → backend caches per (timeframe, networks, exchanges) for 5 minutes
  → GET /api/pools?timeframe={7|14|30|90}&networks={csv}&exchanges={csv}
  → frontend renders table, applies client-side filtering/sorting/pagination
```

### Backend (`backend/src/`)

- **`constants.ts`** — The **source registry**: `SOURCES` is one `SourceConfig` per (exchange, network) with its `kind` (`subgraph` | `messari` | `pancake-explorer` | `orca`), subgraph `dialect`, endpoint, per-source request `concurrency`, capability flags (`discovery` / `simulator` / `track`) and a `note` surfaced beside the row. `findSource(exchange, network)` and `sourcesFor(networks, exchanges, cap)` are the only lookups; `TRACK_NETWORKS` is derived. Also TVL floor ($1M), `TVL_CEILING`, `GATEWAY_RETRIES`, stablecoin list, cache TTL. Environment: `THE_GRAPH_API_KEY` from root `.env`.
- **`services/dialect.ts`** — The V3 forks share one schema apart from a few names (Algebra: `fee`, `derivedMatic`, `maticPriceUSD`; HyperSwap: `derivedNative`, `nativePriceUSD`; V4 adds `hooks`). Every query **aliases** the differing field onto one internal name -- `feeTier`, `derivedNative`, `nativePriceUSD` -- so the response shape and all downstream types are identical across forks. V4 also gets a `txCount_gte` filter on the top-pools page (junk pairs with fabricated prices dominate its TVL ordering).
- **`services/sources/`** — One discovery adapter per source kind, all returning `ComputedPool[]`: `subgraphDiscovery.ts` (any V3-schema subgraph), `messari.ts` (Messari standard schema: daily volume, LP revenue, TVL, ticks, current token price only), `pancakeExplorer.ts` (Pancake's undocumented info-site API: daily fees for a year, daily volume for 30 days, ticks, current TVL, no price history), `orca.ts` (24h/7d/30d aggregates only). `common.ts` has the shared label/CV/fetch helpers.
- **`routes/pools.ts`** — Single endpoint. Parses timeframe + `networks` (default ethereum) + `exchanges` (default all), checks cache, fans out over the matching sources with `Promise.allSettled` and dispatches on `source.kind`. A failing source is reported in `meta.errors` beside the rows that arrived rather than blanking the table; only if every source fails is it a 502. Returns `{ data: ComputedPool[], meta: { timeframe, poolCount, fetchedAt, errors? } }`.
- **`services/subgraph.ts`** — GraphQL queries to any V3-schema endpoint, built through the dialect layer. `querySubgraph` retries `GATEWAY_RETRIES` times with backoff on gateway "bad indexers", timeouts and transport errors (schema errors are thrown straight back) -- several deployments are served by one or two flaky indexers and succeed only on retry. The top-pools page applies the TVL floor client-side rather than as a `where` (pages are TVL-ordered, so the first pool under the floor ends the walk), because older graph-node builds reject a filtered-and-ordered query. Batch fetches take the source's `concurrency`; a pool whose day-data request fails is dropped (with a warning) instead of failing the source.
- **`services/metrics.ts`** — Pure computation: avg daily fees/volume/TVL, APR, Pearson correlation, price volatility (max deviation from mean, stablecoin-aware token selection).
- **`services/cache.ts`** — Simple Map-based TTL cache keyed by `timeframe:networks`.
- **`services/poolSnapshot.ts`** — Live-pool fetch for the simulator: pool meta + windowed ticks (±9200 ticks ≈ price ×/÷2.5, cursor-paginated, max 3 pages) + 365d pool/token history, in 2 GraphQL round trips. TTL cache with in-flight coalescing per `(network, poolId)`.
- **`routes/simulator.ts`** — `GET /presets`, `GET /presets/:id/default`, `GET /pool/:network/:poolId/default?base=0|1&exchange=<key>`, `POST /simulate` (accepts `presetId` or `exchange`+`network`+`poolId`, exchange defaulting to `uniswap-v3`; `lite: true` strips chart arrays for the portfolio fan-out). Pool ids may be 40-hex addresses or 64-hex Uniswap V4 PoolIds. A source without the `simulator` capability gets a 400 naming why.
- **`services/db.ts` + `services/history.ts` + `services/poller.ts`** — SQLite position history via **`node:sqlite`** (built into Node 22.5+; no native module to compile, so do not add better-sqlite3). DB lives at `backend/data/defishack.db` (gitignored, WAL mode); override with `DEFISHACK_DB_PATH`. `watched_wallets` drives a background poller (`SNAPSHOT_POLL_INTERVAL_MS`, default 15 min, override `DEFISHACK_POLL_INTERVAL_MS`) that snapshots each watched wallet's positions into `position_snapshots`. Watch endpoints: `GET/POST /api/track/watch`, `DELETE /api/track/watch/:address`.
- **`routes/track.ts` + `services/tracker.ts`** — `GET /api/track/:address?networks=csv` (networks limited to `TRACK_NETWORKS`): active concentrated-liquidity positions per wallet, fanned out over every source on the network with the `track` capability (Uniswap V3, PancakeSwap V3 on Ethereum/Base, QuickSwap, HyperSwap; not V4, whose Position entity carries no feeGrowth). NFT token ids collide across the V3 forks on one chain, so `positionId` is namespaced `${exchange}:${id}` for every exchange except Uniswap V3, which keeps the bare id so its recorded history stays attached. Uncollected fees are computed exactly from on-chain feeGrowth values (BigInt, uint256 wrap-around); vs-HODL benchmarks (initial / 50-50 / all-A / all-B) use entry-day token prices from `tokenDayDatas`. **The deployed subgraphs' `collectedFeesToken1` mirrors token0 (data bug), so lifetime collected fees are excluded — earnings are unclaimed-only.** 60s TTL cache.
- **`core/`** — Simulator engine. `math.ts` (Uniswap V3 liquidity/IL math; `aprFromVolume` includes the position's own L in the denominator = deposit dilution), `liquidity.ts` (active-liquidity curve anchored on pool.liquidity at the current tick, walked outward via `liquidityNet`), `context.ts` (builds a `SimContext` from a preset [synthetic history] or a live snapshot [oriented real history]; base/quote orientation, volume stats with spike trim, historical joint 7d moves), `simulation.ts` (metrics, calc methods current/peak/average/custom, realistic vs worst-case APR, scenarios with recovery days, divergence-loss scenarios, depth-chart buckets, range presets).

### Simulator orientation model

All simulator prices are **oriented**: `quote per base` where `baseToken: 0|1` selects which subgraph token is base (auto: stablecoin becomes quote, else price ≥ 1). Subgraph `poolDayData` OHLC tracks `token0Price` (token0 per token1); invert when base = token0. Position math runs in quote units and converts to USD via `pool.quoteUsd`. Raw tick liquidity converts to adjusted units by dividing by `10^((dec0+dec1)/2)`, which is orientation-invariant. The frontend flips orientation client-side by inverting currentPrice/lower/upper (no refetch).

### Frontend (`frontend/src/`)

- **Next.js 15 + React 19**, all pages are client components (`"use client"`)
- **Bulma CSS** imported globally in `layout.tsx`
- **`hooks/usePoolData.ts`** — Fetches from backend API, re-fetches on timeframe/network change
- **`hooks/useFilters.ts`** — Client-side min/max range filtering with defaults (TVL >= $1M, APR >= 1%, fees >= $1K, volume >= $1M)
- **`hooks/useSorting.ts`** — Column sort state, default TVL descending. String columns use `localeCompare`, numeric use subtraction.
- **`components/ControlsBar.tsx`** — Dropdowns for opportunity type, exchange (multi-select, all selected by default, labelled "All exchanges"), network (multi-select), timeframe, and hide-filtered toggle
- **`components/PoolRow.tsx`** — Renders `null` metrics as a dash with a tooltip (sources without a price series), a `†` beside the exchange carrying the source's `note`, an initials chip where an icon file is missing (`NETWORK_ICONS` / `EXCHANGE_ICONS` are keyed by id and optional), and a disabled Simulate button when `canSimulate` is false. The Simulate link carries `&exchange=` for anything but Uniswap V3, as do the portfolio, track and last-simulation links.
- **`utils/constants.ts`** — Column definitions, network/exchange lists, pagination config (20 rows/page, 5 pages max, 100 max display)
- **`app/portfolio`** — Portfolio builder: positions saved from the simulator to localStorage (`defishack.portfolio.v1` via `lib/portfolio.ts`), risk scoring/backbone pick, allocation edits (lite re-simulate), market-wide stress test (stablecoins pinned at $1)
- **`app/track`** — Wallet position tracking against `/api/track`; remembers the last address in localStorage. Also hosts **custom positions** (`components/track/`, `lib/custom.ts`, localStorage key `defishack.custom.v1`): manually tracked pools on unsupported DEXes/chains with the deposit → check → claim → withdraw lifecycle; current token prices resolve by CoinGecko id through `GET /api/prices?ids=csv` (60s-cached proxy in `backend/src/routes/prices.ts`), with per-token manual USD overrides as fallback
- **Path alias:** `@/*` maps to `./src/*`
- **Black theme, one palette** (`app/globals.css`): the colour tokens (`--bg-*`, `--tx/--ts/--tm`, accents) live on `:root` and every screen reads them. They were scoped to `.simulator-shell` while the simulator was the only dark page, so Discovery, Portfolio and Track ran on Bulma's light default and the app changed complexion as you moved through it. `.simulator-shell` now carries only typography and box-sizing. `<html data-theme="dark">` puts Bulma in dark mode, and its scheme is retuned through the HSL lightness stops it derives everything from (`--bulma-scheme-main-l: 0%` etc.) rather than overridden rule by rule.
- **Bulma 1.x dark mode has two gaps, both worked around in `globals.css`.** (1) It flips the scheme but leaves every `is-light` variant alone -- they are built for light schemes -- so a `notification is-light` renders as a 96%-lightness box carrying the dark theme's pale text, i.e. unreadable; each pale surface is remapped to the dark end of its own colour ramp. `.notification.is-light.is-light` additionally hardcodes `90%`, which no variable can reach, so it needs a selector outranking (0,3,0). `--bulma-dark-*` is deliberately left alone: the navbar is `is-dark` and inverting it turns it white. (2) The `has-text-*` helpers are emitted as literal `!important` colours, not variables, so the palette cannot reach them either; `.has-text-grey` (4.48:1) and `.has-text-warning-dark` (1.27:1 -- effectively invisible) are overridden directly. When adding a Bulma helper to a dark screen, check the computed contrast rather than assuming the theme handled it.
- **Selected Discovery rows** are a tint plus a left edge, not a fill. The fill was `background-color: #3273dc !important; color: #fff`, but the colour never landed: Bulma's `.table td` is specificity (0,1,1) and outranks a bare `.row-selected` (0,1,0), so the text stayed dark grey on mid-blue and the Simulate link blue on blue. Colours are set on the cells, and on the striped/hover variants Bulma layers over them.
- **The Simulator nav link resumes the last live pool** (`lib/lastSim.ts`, localStorage `defishack.lastsim.v1`). A bare `/simulator` loads `preset[0]`, a synthetic demo pool -- the right landing page exactly once. The entry is written only after a live pool actually resolves, so the link cannot point at a pool that failed to load, and `saveLastSim` fires a `defishack:lastsim` event because the `storage` event only reaches *other* tabs.


### Type contract

Backend `ComputedPool` (`backend/src/types/pool.ts`) ↔ frontend `Pool` (`frontend/src/types/pool.ts`), and backend simulator types (`backend/src/core/types.ts`) ↔ frontend (`frontend/src/types/simulator.ts`) are manually kept in sync — same shapes, duplicated. Changes to either API response shape must be updated in both packages.

## Key Domain Rules

- **Metric definitions were frozen for V1** and deliberately revised once (see APR and day-data hygiene below) after the table was found not to reconcile: TVL was reported as a current value while APR divided by a windowed average. Treat further changes the same way — they feed V2 simulation inputs, so revise deliberately and update this file. Newer metrics (`feeToTvlPct`, `volumeCV`, `correlation7d/30d`) are additive fields computed alongside, never redefinitions.
- **FATE filter preset** (`FATE_FILTERS` in `frontend/src/utils/constants.ts`): **APR 10–100%**, TVL ≥ $1M, volatility < 15%, applied to plain pool APR. The framework's original 30–500% band assumes a concentrated in-range position; against pool-wide APR nothing matched, and the in-range proxy built to satisfy it proved unrealistic (see the APR note above). 10–100% is a shortlisting filter, not a yield expectation — it currently matches ~18 pools at 7d and ~6 at 30d on Ethereum. Correlation is intentionally not auto-filtered — stable-quoted pools report correlation 0 (constant stablecoin price) and would always be excluded.
- **In-range time** is time-weighted over recorded snapshots: each snapshot's state holds until the next (step function), and gaps longer than `SNAPSHOT_MAX_GAP_SEC` (90 min) count as *unobserved* rather than being attributed to the last known state — so downtime lowers `coverage` instead of inflating in-range time. `npm run verify:history` (in `backend/`) checks this math against synthetic series.
- **Volatility token selection:** if either token is a known stablecoin, use the other token's price; if neither, use token0
- **Stablecoins:** USDC, USDT, DAI, FRAX, LUSD, crvUSD
- **APR formula:** `mean(dayFees / dayTVL) * 365 * 100` — the mean of each day's yield, not `mean(fees) / mean(TVL)`. The ratio of means weights high-TVL days more heavily and skews pools whose TVL trends across the window. Fee APR only, excludes IL.
- **Day-data hygiene** (`usableDays` in `services/metrics.ts`, applied once in `routes/pools.ts` so every metric shares one sample): the current UTC day is excluded because it is still accumulating and averaging it as a whole day understates every rate, worst on short timeframes; days reporting TVL above `TVL_CEILING` ($50B) are excluded because the subgraph occasionally emits a corrupt figure (one pool reported $9.9T on a single day against a $1.7M median, which alone produced a $397B 90-day average). Pools whose *current* TVL exceeds the ceiling are dropped entirely.
- **`tvl` is rebuilt from tick liquidity, not read from the subgraph.** The subgraph's `totalValueLocked*` fields drift far above what LP positions actually hold — measured 2.33x on WETH/USDT 0.3%, 4.96x on WBTC/WETH 0.3%, 11.20x on USDC/WETH 0.3% — which understated every APR by the same factor. `services/poolLiquidity.ts` walks `liquidityNet` outward from the current tick (anchored on `pool.liquidity`) and values the token amounts each tick range holds. The reconstruction self-validates: `sum(liquidityNet) == 0` and a bottom-up cumulative walk reproduces `pool.liquidity` exactly. Only *current* liquidity can be rebuilt, so the daily TVL series is rescaled by `reconstructed / subgraphCurrent` — right shape, corrected level. **That factor is measured today and applied backwards across the window**, so it assumes the subgraph's inflation was proportionally the same earlier in the period. Mild over 7–14 days, a stronger assumption at 90, and not verifiable: historical tick data is not retrievable, and comparing the daily `tvlUSD` series against daily `liquidity` does not settle it because price moves confound the two. The error is linear — a 10% error in the factor moves TVL and APR about 10% in opposite directions — so treat short windows as the reliable ones. Falls back to the subgraph figure when ticks are unavailable, flagged by `tvlSource: "subgraph"` (~25 of 286 pools) and marked with `*` in the table.
- **There is one APR, and it describes the pool, not a position.** An `activeApr` / `liveActiveApr` pair (fees over the liquidity within 2% of spot, plus a $10k reference deposit) was added to mirror Metrix Finance and then removed. It divides fees by the *value* of nearby liquidity, which implicitly assumes your capital carries the same liquidity density as the tightest positions already in the pool. Real liquidity clusters hard against spot, so it ran ~3x optimistic: on WETH/USDT 0.3% it quoted 257% for a nominal ±2% band while the simulator — which derives the position's actual `L`, its share of the active liquidity at the calculation tick, and its own dilution — put a genuine ±2% position at 85%. **Anything range-sensitive belongs in the simulator, not in a pool-level column.** The tick reconstruction that fed it is kept, because correcting `tvl` is independent and still right.
- **Range presets** (`buildRangePresets` in `core/simulation.ts`, rendered by `components/simulator/RangePresets.tsx`): the same deposit repriced at +/-0.5/1/2/5/10/25%, each row clickable to apply that range. Widths mirror the config panel's pills, and each row runs the *full* `computeMetrics` path so presets inherit the calculation method, volume window and deposit size already chosen rather than approximating them. This is the bridge from Discovery's pool-level APR, which cannot know the range you pick, to a number for an actual position. APR and 30d in-range probability are shown together deliberately: on WETH/USDT 0.3% the +/-0.5% row reads 389% APR at 2% in-range, the +/-25% row 8.1% at 83% -- the top APR is almost never the right position.

- **CSS modules: `.tbl td { color: ... }` outranks a bare state class on the same cell.** The base cell rule is specificity (0,1,1) and beats `.good` / `.tdIL` / `.up` at (0,1,0), so colour-coding applied directly to a `<td>` silently renders in the default text colour -- no error, just a monochrome table. Scope such rules as `.tbl .good` (0,2,0), which wins and still matches when the class sits on a nested span instead. This had quietly flattened the whole scenario table's IL/fees/PnL coding.
- **Source coverage is per (exchange, network), and every ID was probed before being wired in.** Docs pages and the Graph Explorer list deployments that are unindexed, months stale, or served by one dead indexer; `tools/probe-subgraphs.mjs` sends the pipeline's own four requests and is the only test that counts. What that found, and why the registry looks the way it does:
  - **Uniswap V3**: official deployments on Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche. The official BSC one (`F85MNz...`) answers only trivial queries; a community deployment (`G5MUbS...`) carries real traffic and works with retries. **Optimism goes down at the gateway for stretches** -- all four of its indexers unavailable at once -- and then the table shows "Unavailable right now" for it; nothing in this codebase can fix that.
  - **Uniswap V4**: native schema plus `hooks`, on all seven EVM chains; Base and BSC use the deployments the explorer shows traffic on (the ones published beside mainnet's are stuck with indexing errors); Polygon's bundle reports the native price as 0, so USD prices come from `tokenDayData` there. Discovery + simulator only.
  - **PancakeSwap V3**: native subgraphs on Ethereum and Base (full capability). Its BSC subgraph has carried an indexing error for years and Messari's BSC copy stopped in August 2026, so BSC and Arbitrum read Pancake's explorer API: discovery only, no volatility/correlation. That API returns every number as a string.
  - **SushiSwap V3**: Sushi's own subgraphs died with the hosted service; Messari's indexing remains on Ethereum, Arbitrum and Avalanche (discovery only, no price series, junk-pair ordering filtered by swap count). No V3 subgraph of any schema exists for Sushi on Polygon, Optimism or BSC.
  - **QuickSwap**: wired to its current Algebra Integral deployment (the older V3 one is drained and served by two failing indexers), but its largest Polygon pool is ~$120K -- under the $1M floor -- so it returns no rows until the floor is lowered or the liquidity returns.
  - **HyperSwap** (HyperEVM): native V3 schema on an Ormi-hosted Graph-compatible endpoint, full capability.
  - **Orca** (Solana): public REST API with 24h/7d/30d aggregates only; discovery with the series-derived columns blank, no simulator or tracker. The 7-day and 14-day timeframes both read Orca's 7d window, 30 and 90 its 30d.
- **A reconstruction above the subgraph's own TVL is rejected.** The subgraph figure is the contract's whole balance and over-counts (2-11x), so a tick walk that comes out *above* it means bad data went in, not a better answer. `RECONSTRUCTION_MAX_RATIO` (1.5) falls such rows back to the source figure and they count in the `[pools]` warning. The case that motivated it: Polygon USDC/USDT 0.01% walked to $3.4B against a $1.55M pool, with `sum(liquidityNet) == 0` and the cumulative walk matching `pool.liquidity` exactly -- the subgraph's tick data claimed ~10^15 of liquidity between ticks 4054 and 39122, which is internally consistent and physically impossible. The two self-checks therefore do not suffice on their own.
- **Correlation:** Pearson correlation of daily USD prices for both tokens, aligned by date

## Source Matrix

Discovery (D), simulator (S), tracker (T). See `SOURCES` in `backend/src/constants.ts` for the endpoints and the reasoning behind each choice.

| Exchange | Ethereum | Arbitrum | Base | Optimism | Polygon | BSC | Avalanche | HyperEVM | Solana |
|---|---|---|---|---|---|---|---|---|---|
| Uniswap V3 | DST | DST | DST | DST¹ | DST | DST¹ | DST | – | – |
| Uniswap V4 | DS | DS | DS | DS | DS | DS | DS | – | – |
| PancakeSwap V3 | DST | D² | DST | – | – | D² | – | – | – |
| SushiSwap V3 | D³ | D³ | – | – | – | – | D³ | – | – |
| QuickSwap | – | – | – | – | DST⁴ | – | – | – | – |
| HyperSwap V3 | – | – | – | – | – | – | – | DST | – |
| Orca | – | – | – | – | – | – | – | – | D⁵ |

¹ thinly indexed: retries and a lower request concurrency; Optimism drops out entirely at times · ² PancakeSwap explorer API, no price history · ³ Messari schema, no price history · ⁴ no pool above the $1M floor · ⁵ 7d/30d aggregates only
