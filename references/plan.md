# LPSim — Project Outline

## Terminology

| Term | Definition |
|------|------------|
| DeFi | Decentralized Finance |
| Exchange | Platforms where liquidity pools exist — UniSwap, Orca, Aerodrome, Velodrome |
| Network | Blockchain network — Ethereum, Solana, Arbitrum, Base |
| LP | Liquidity Pool — a smart contract holding token pairs for decentralized trading |
| APR | Annual Percentage Rate — annualized return from fees |
| TVL | Total Value Locked — total USD value of assets in a pool |
| Daily Fees | Total fees collected by a pool in a 24-hour period |
| Daily Volume | Total volume transacted by a pool in a 24-hour period |
| Price Volatility | Maximum deviation of token price from mean price over a selected timeframe |

---

## Project Overview

Web application for DeFi investors to discover, simulate, and track liquidity pool opportunities.

| Version | Name | Purpose |
|---------|------|---------|
| V1 | Discovery | Shortlist LP opportunities from exchanges/networks based on metrics |
| V2 | Simulate | Model potential returns for a given LP position |
| V3 | Track | Monitor active portfolio positions |

---

## Architecture Decisions

### V1 Constraints (confirmed)
- **Stateless** — no user accounts, no database, no session persistence
- **Uniswap V3 on Ethereum and Arbitrium only** — single exchange + networks to validate pipeline
- **Data source: The Graph (Uniswap V3 subgraph)** — GraphQL API, requires API key, provides raw pool and daily data needed for exact metric computation
- **Default dataset: top 500 pools by TVL** fetched from The Graph, filtered down to top 100 displayed
- **Deployment: none** — local development and testing only for V1

### Future Expansion (V2+)
- Add exchanges: Aerodrome (Base), Velodrome (Optimism), Orca (Solana)
- Add networks as exchanges are added
- Add auth + database when portfolio tracking (V3) requires persistence

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (React, TypeScript) |
| CSS Framework | Bulma |
| Backend | Express.js (Node.js, TypeScript) |
| Data Source (V1) | The Graph — Uniswap V3 Subgraph (GraphQL) |
| Deployment | TBD |

---

## Metric Definitions

These definitions are fixed for V1. Changing them later breaks V2 simulation inputs.

### TVL
Total USD value of both tokens locked in the pool at the time of data fetch.

### Average Daily TVL
Average daily TVL during the selected time frame (in USD).

### Average Daily Fees
Average daily fees collected by the pool during the selected time frame (in USD).

### Average Daily APR
```
Average APR = (Average daily Fees / Average daily TVL) * 365 * 100
```
Fee APR only — excludes token price appreciation/impermanent loss.

### Price Volatility
Maximum deviation from mean of the **non-stablecoin token's USD price** over the selected timeframe (7, 30, or 90 days), normalized as a percentage of the mean price over that period.
- Source: `tokenDayData.priceUSD` from The Graph for the selected token
- **Token selection rule:** if either token is a known stablecoin (USDC, USDT, DAI, FRAX, LUSD, crvUSD), use the other token's price. If neither is a stablecoin, use token0.
- Formula: `(max(meanPriceUSD - lowestPriceUSD, highestPriceUSD - meanPriceUSD) / mean(priceUSD)) * 100`

### Average Daily Volume
Average daily volume transacted during the selected time frame (in USD).

### Correlation
Correlation between the two tokens during the selectied time frame (in USD).
---

## Data Layer

### Source: The Graph — Uniswap V3 Subgraph

- **Endpoint:** `https://gateway.thegraph.com/api/{API_KEY}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`
- **Protocol:** GraphQL
- **Auth:** API key from The Graph Studio (free tier available)

### Key Entities Used

| Entity | Fields Used | Purpose |
|--------|-------------|---------|
| `pools` | `id`, `token0`, `token1`, `feeTier`, `totalValueLockedUSD`, `volumeUSD`, `feesUSD` | Pool list + current TVL |
| `poolDayDatas` | `date`, `feesUSD`, `tvlUSD`, `volumeUSD` | Daily fees, APR computation |
| `tokenDayDatas` | `date`, `priceUSD`, `token { id }` | Token USD price for volatility |

### Fetch Strategy (V1)

**Step 1 — Pool list (pre-filtered):**
```graphql
{
  pools(
    first: 500
    orderBy: totalValueLockedUSD
    orderDirection: desc
    where: { totalValueLockedUSD_gte: "1000000" }
  ) {
    id
    feeTier
    totalValueLockedUSD
    token0 { id symbol }
    token1 { id symbol }
  }
}
```
> TVL floor: $1,000,000 USD. Pools below this threshold have unreliable fee and volatility signals.

**Step 2 — Daily metrics (per pool, batched):**
```graphql
{
  poolDayDatas(
    where: { pool: $poolId, date_gte: $startTimestamp }
    orderBy: date, orderDirection: desc
  ) {
    date
    feesUSD
	  volumeUSD
    tvlUSD
  }
}
```

**Step 3 — Token price history (for volatility):**
```graphql
{
  tokenDayDatas(
    where: { token: $token0Id, date_gte: $startTimestamp }
    orderBy: date, orderDirection: desc
  ) {
    date
    priceUSD
  }
}
```

### Computed Fields (backend responsibility)

| Field | Formula |
|-------|---------|
| `tvl` | `totalValueLockedUSD` from pool entity |
| `fees` | `mean(feesUSD over period)` |
| `volume` | `mean(volumeUSD over period)` |
| `apr` | `(mean(feesUSD over period) / mean(tvlUSD over period)) * 365 * 100` |
| `corr` | `Pearson correlation of daily USD prices for both tokens over period` |
| `volatility` | `((max(mean - lowest, highest - mean) / mean(priceUSD)) * 100) over period` |

### Caching
5-minute in-memory cache on the Express server per `(timeframe)` combination — avoids repeat API calls during a single browsing session.

---

## V1: Discovery — Workflow

### UI Controls
1. **Opportunity type selector** — LP / Lending-Borrowing / Staking (V1: LP only, others disabled)
2. **Exchange selector** — drop-down multi-select (V1: Uniswap V3 only, pre-selected, locked)
3. **Network selector** — drop-down multi-select (V1: Ethereum only, pre-selected, locked)
4. **Timeframe selector** — drop-down single select: 7 days / 30 days / 90 days (affects volatility calculation)

### Table Display
Columns: Pool Name | Exchange | Network | TVL | Average APR | Average Daily Fees | Average Daily Volume | Correlation | Price Volatility

Each column has:
- **Editable min/max filter inputs** shown below the column header
- **Sort toggle** (ascending / descending)

### Filtering & Sorting Rules
- All filters are applied client-side on the fetched top-500 dataset
- After filtering, sort by selected column
- Display top 100 results from the filtered+sorted set
- **Server-side pagination**: 20 rows per page (5 pages max)

### Additional Options
- **Hide unselected pools** toggle — collapses pools not matching current filter criteria rather than removing them

### Data Flow
```
User selects timeframe
  → Backend queries The Graph: top 500 pools by TVL
  → Backend queries poolDayDatas + tokenDayDatas for each pool (batched)
  → Backend computes APR, dailyFees, dailyVolume, priceVolatility, returns structured JSON
  → Frontend renders table with client-side filter/sort
  → Pagination applied to final filtered set
```

---

## V2: Simulate — Workflow

> To be defined. Depends on V1 metric definitions being stable.

Likely inputs: pool selection from V1, position size (USD), entry date, time horizon.
Likely outputs: projected fee income, impermanent loss estimate, net APR.

---

## V3: Track — Workflow

> To be defined. Requires auth + database (breaks stateless constraint — new architecture needed).

---

## Open Questions

None at this time. Ready to begin implementation.

### Repository

https://github.com/kodence/lpSimulator.git
