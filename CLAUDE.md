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
The Graph (Uniswap V3 subgraph per network)
  → backend fetches top 500 pools by TVL, poolDayDatas, tokenDayDatas
  → backend computes metrics (APR, volatility, correlation, fees, volume)
  → backend caches per (timeframe, networks) for 5 minutes
  → GET /api/pools?timeframe={7|14|30|90}&networks={csv}
  → frontend renders table, applies client-side filtering/sorting/pagination
```

### Backend (`backend/src/`)

- **`constants.ts`** — Network configs (subgraph URLs per chain), TVL floor ($1M), stablecoin list, cache TTL. Environment: `THE_GRAPH_API_KEY` from root `.env`.
- **`routes/pools.ts`** — Single endpoint. Parses timeframe + networks, checks cache, orchestrates fetch → compute → respond. Returns `{ data: ComputedPool[], meta: { timeframe, poolCount, fetchedAt } }`.
- **`services/subgraph.ts`** — GraphQL queries to The Graph. Batches pool/token day data fetches with concurrency limit of 10.
- **`services/metrics.ts`** — Pure computation: avg daily fees/volume/TVL, APR, Pearson correlation, price volatility (max deviation from mean, stablecoin-aware token selection).
- **`services/cache.ts`** — Simple Map-based TTL cache keyed by `timeframe:networks`.
- **`services/poolSnapshot.ts`** — Live-pool fetch for the simulator: pool meta + windowed ticks (±9200 ticks ≈ price ×/÷2.5, cursor-paginated, max 3 pages) + 365d pool/token history, in 2 GraphQL round trips. TTL cache with in-flight coalescing per `(network, poolId)`.
- **`routes/simulator.ts`** — `GET /presets`, `GET /presets/:id/default`, `GET /pool/:network/:poolId/default?base=0|1`, `POST /simulate` (accepts `presetId` or `network`+`poolId`; `lite: true` strips chart arrays for the portfolio fan-out).
- **`services/db.ts` + `services/history.ts` + `services/poller.ts`** — SQLite position history via **`node:sqlite`** (built into Node 22.5+; no native module to compile, so do not add better-sqlite3). DB lives at `backend/data/defishack.db` (gitignored, WAL mode); override with `DEFISHACK_DB_PATH`. `watched_wallets` drives a background poller (`SNAPSHOT_POLL_INTERVAL_MS`, default 15 min, override `DEFISHACK_POLL_INTERVAL_MS`) that snapshots each watched wallet's positions into `position_snapshots`. Watch endpoints: `GET/POST /api/track/watch`, `DELETE /api/track/watch/:address`.
- **`routes/track.ts` + `services/tracker.ts`** — `GET /api/track/:address?networks=csv`: active Uniswap V3 positions per wallet. Uncollected fees are computed exactly from on-chain feeGrowth values (BigInt, uint256 wrap-around); vs-HODL benchmarks (initial / 50-50 / all-A / all-B) use entry-day token prices from `tokenDayDatas`. **The deployed subgraphs' `collectedFeesToken1` mirrors token0 (data bug), so lifetime collected fees are excluded — earnings are unclaimed-only.** 60s TTL cache.
- **`core/`** — Simulator engine. `math.ts` (Uniswap V3 liquidity/IL math; `aprFromVolume` includes the position's own L in the denominator = deposit dilution), `liquidity.ts` (active-liquidity curve anchored on pool.liquidity at the current tick, walked outward via `liquidityNet`), `context.ts` (builds a `SimContext` from a preset [synthetic history] or a live snapshot [oriented real history]; base/quote orientation, volume stats with spike trim, historical joint 7d moves), `simulation.ts` (metrics, calc methods current/peak/average/custom, realistic vs worst-case APR, scenarios with recovery days, divergence-loss scenarios, depth-chart buckets).

### Simulator orientation model

All simulator prices are **oriented**: `quote per base` where `baseToken: 0|1` selects which subgraph token is base (auto: stablecoin becomes quote, else price ≥ 1). Subgraph `poolDayData` OHLC tracks `token0Price` (token0 per token1); invert when base = token0. Position math runs in quote units and converts to USD via `pool.quoteUsd`. Raw tick liquidity converts to adjusted units by dividing by `10^((dec0+dec1)/2)`, which is orientation-invariant. The frontend flips orientation client-side by inverting currentPrice/lower/upper (no refetch).

### Frontend (`frontend/src/`)

- **Next.js 15 + React 19**, all pages are client components (`"use client"`)
- **Bulma CSS** imported globally in `layout.tsx`
- **`hooks/usePoolData.ts`** — Fetches from backend API, re-fetches on timeframe/network change
- **`hooks/useFilters.ts`** — Client-side min/max range filtering with defaults (TVL >= $1M, APR >= 1%, fees >= $1K, volume >= $1M)
- **`hooks/useSorting.ts`** — Column sort state, default TVL descending. String columns use `localeCompare`, numeric use subtraction.
- **`components/ControlsBar.tsx`** — Dropdowns for opportunity type, exchange (multi-select), network (multi-select), timeframe, and hide-filtered toggle
- **`utils/constants.ts`** — Column definitions, network/exchange lists, pagination config (20 rows/page, 5 pages max, 100 max display)
- **`app/portfolio`** — Portfolio builder: positions saved from the simulator to localStorage (`defishack.portfolio.v1` via `lib/portfolio.ts`), risk scoring/backbone pick, allocation edits (lite re-simulate), market-wide stress test (stablecoins pinned at $1)
- **`app/track`** — Wallet position tracking against `/api/track`; remembers the last address in localStorage. Also hosts **custom positions** (`components/track/`, `lib/custom.ts`, localStorage key `defishack.custom.v1`): manually tracked pools on unsupported DEXes/chains with the deposit → check → claim → withdraw lifecycle; current token prices resolve by CoinGecko id through `GET /api/prices?ids=csv` (60s-cached proxy in `backend/src/routes/prices.ts`), with per-token manual USD overrides as fallback
- **Path alias:** `@/*` maps to `./src/*`

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
- **Correlation:** Pearson correlation of daily USD prices for both tokens, aligned by date

## Supported Networks

Each network has its own Uniswap V3 subgraph on The Graph decentralized network:

| Network | Subgraph ID |
|---------|-------------|
| Ethereum | `5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV` |
| Arbitrum | `FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aJM` |
| Base | `43Hwfi3dJSoGpyas9VwNoDAv55yjgGrPpNSmbQZArzMG` |

All use the same schema: `pools`, `poolDayDatas`, `tokenDayDatas`.
