# DeFi Shack

Web application for discovering DeFi liquidity pool opportunities. V1 focuses on Uniswap V3 pools on Ethereum.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (React 19, TypeScript) |
| CSS Framework | Bulma |
| Backend | Express.js (Node.js, TypeScript) |
| Data Source | The Graph — Uniswap V3 Subgraph (GraphQL) |
| Deployment | TBD |

## Project Structure

```
<repo root>/
├── backend/             Express API server (port 3001)
│   └── src/
│       ├── index.ts            Server entry point
│       ├── constants.ts        Config values (subgraph URL, pool count, etc.)
│       ├── routes/pools.ts     GET /api/pools?timeframe=N
│       ├── services/
│       │   ├── subgraph.ts     GraphQL queries to The Graph
│       │   ├── metrics.ts      APR, volatility, fee computation
│       │   └── cache.ts        5-minute in-memory cache
│       └── types/
│           ├── pool.ts         ComputedPool, ApiResponse
│           └── subgraph.ts     Raw GraphQL response types
├── frontend/            Next.js app (port 3000)
│   └── src/
│       ├── app/
│       │   ├── page.tsx        Main page (LP Discovery)
│       │   ├── layout.tsx      Root layout
│       │   └── globals.css     All styles
│       ├── components/
│       │   ├── ControlsBar.tsx   Opportunity/Exchange/Network/Timeframe selectors
│       │   ├── PoolTable.tsx     Table wrapper
│       │   ├── TableHeader.tsx   Sortable column headers
│       │   ├── FilterRow.tsx     Min/max filter inputs per column
│       │   ├── PoolRow.tsx       Single pool data row
│       │   ├── Pagination.tsx    Page navigation (20 rows/page, 5 pages max)
│       │   └── HideToggle.tsx    Show/hide filtered-out pools toggle
│       ├── hooks/
│       │   ├── usePoolData.ts    Fetches pools from backend API
│       │   ├── useFilters.ts     Client-side min/max filtering
│       │   └── useSorting.ts     Column sort state
│       ├── types/pool.ts         Shared frontend types
│       └── utils/
│           ├── constants.ts      Column defs, API base URL, pagination config
│           └── format.ts         USD and percent formatters
├── plan/                Project planning docs
│   └── Plan.md          Full project specification
├── .env                 THE_GRAPH_API_KEY
└── package.json         Root scripts (concurrently runs both servers)
```

## Prerequisites

- Node.js 18+
- API key from [The Graph Studio](https://thegraph.com/studio/) (free tier)

## Setup

```bash
# Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..

# Configure environment
# Edit .env and set THE_GRAPH_API_KEY=your_key
```

## Development

```bash
# Run both servers concurrently
npm run dev

# Or run individually
npm run dev:backend    # Express on http://localhost:3001
npm run dev:frontend   # Next.js on http://localhost:3000
```

## API

### GET /api/pools?timeframe={7|30|90}

Returns computed pool metrics for the top pools by TVL.

**Response:**
```json
{
  "data": [
    {
      "id": "0x...",
      "poolName": "WETH / USDC (0.05%)",
      "token0": { "id": "0x...", "symbol": "WETH" },
      "token1": { "id": "0x...", "symbol": "USDC" },
      "feeTier": 500,
      "tvl": 123456789.00,
      "apr": 12.34,
      "avgDailyFees": 45678.90,
      "avgDailyVolume": 12345678.90,
      "priceVolatility": 5.67
    }
  ],
  "meta": {
    "timeframe": 30,
    "poolCount": 200,
    "fetchedAt": "2026-03-28T12:00:00.000Z"
  }
}
```
