# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run both servers concurrently (from repo root)
npm run dev

# Run individually
npm run dev:backend    # Express on http://localhost:3001 (tsx watch, auto-reloads)
npm run dev:frontend   # Next.js on http://localhost:3000 (Turbopack)

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
  → GET /api/pools?timeframe={7|30|90}&networks={csv}
  → frontend renders table, applies client-side filtering/sorting/pagination
```

### Backend (`backend/src/`)

- **`constants.ts`** — Network configs (subgraph URLs per chain), TVL floor ($1M), stablecoin list, cache TTL. Environment: `THE_GRAPH_API_KEY` from root `.env`.
- **`routes/pools.ts`** — Single endpoint. Parses timeframe + networks, checks cache, orchestrates fetch → compute → respond. Returns `{ data: ComputedPool[], meta: { timeframe, poolCount, fetchedAt } }`.
- **`services/subgraph.ts`** — GraphQL queries to The Graph. Batches pool/token day data fetches with concurrency limit of 10.
- **`services/metrics.ts`** — Pure computation: avg daily fees/volume/TVL, APR, Pearson correlation, price volatility (max deviation from mean, stablecoin-aware token selection).
- **`services/cache.ts`** — Simple Map-based TTL cache keyed by `timeframe:networks`.
- **`services/poolSnapshot.ts`** — Live-pool fetch for the simulator: pool meta + windowed ticks (±9200 ticks ≈ price ×/÷2.5, cursor-paginated, max 3 pages) + 365d pool/token history, in 2 GraphQL round trips. TTL cache with in-flight coalescing per `(network, poolId)`.
- **`routes/simulator.ts`** — `GET /presets`, `GET /presets/:id/default`, `GET /pool/:network/:poolId/default?base=0|1`, `POST /simulate` (accepts `presetId` or `network`+`poolId`).
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
- **Path alias:** `@/*` maps to `./src/*`

### Type contract

Backend `ComputedPool` (`backend/src/types/pool.ts`) ↔ frontend `Pool` (`frontend/src/types/pool.ts`), and backend simulator types (`backend/src/core/types.ts`) ↔ frontend (`frontend/src/types/simulator.ts`) are manually kept in sync — same shapes, duplicated. Changes to either API response shape must be updated in both packages.

## Key Domain Rules

- **Metric definitions are frozen for V1** — changing them breaks V2 simulation inputs. Newer metrics (`feeToTvlPct`, `volumeCV`, `correlation7d/30d`) are additive fields computed alongside, never redefinitions.
- **FATE filter preset** (`FATE_FILTERS` in `frontend/src/utils/constants.ts`): APR 30–500%, TVL ≥ $1M, volatility < 15%. Correlation is intentionally not auto-filtered — stable-quoted pools report correlation 0 (constant stablecoin price) and would always be excluded.
- **Volatility token selection:** if either token is a known stablecoin, use the other token's price; if neither, use token0
- **Stablecoins:** USDC, USDT, DAI, FRAX, LUSD, crvUSD
- **APR formula:** `(avgDailyFees / avgDailyTVL) * 365 * 100` — fee APR only, excludes IL
- **Correlation:** Pearson correlation of daily USD prices for both tokens, aligned by date

## Supported Networks

Each network has its own Uniswap V3 subgraph on The Graph decentralized network:

| Network | Subgraph ID |
|---------|-------------|
| Ethereum | `5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV` |
| Arbitrum | `FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aJM` |
| Base | `43Hwfi3dJSoGpyas9VwNoDAv55yjgGrPpNSmbQZArzMG` |

All use the same schema: `pools`, `poolDayDatas`, `tokenDayDatas`.
