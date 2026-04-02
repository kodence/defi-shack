import { PoolPreset } from "./types";

export const PRESETS: PoolPreset[] = [
  {
    id: "usdc-weth-03", name: "USDC / WETH",
    token0Symbol: "WETH", token1Symbol: "USDC",
    feeTier: 3000, feeLabel: "0.3%",
    defaultPrice: 2000, defaultVolume: 28_000_000,
    tvlUsd: 180_000_000, defaultRangePct: 0.15, annualVolatility: 0.80,
  },
  {
    id: "usdc-weth-005", name: "USDC / WETH",
    token0Symbol: "WETH", token1Symbol: "USDC",
    feeTier: 500, feeLabel: "0.05%",
    defaultPrice: 2000, defaultVolume: 95_000_000,
    tvlUsd: 120_000_000, defaultRangePct: 0.05, annualVolatility: 0.80,
  },
  {
    id: "wbtc-weth-03", name: "WBTC / WETH",
    token0Symbol: "WBTC", token1Symbol: "WETH",
    feeTier: 3000, feeLabel: "0.3%",
    defaultPrice: 16.5, defaultVolume: 8_000_000,
    tvlUsd: 45_000_000, defaultRangePct: 0.10, annualVolatility: 0.65,
  },
  {
    id: "usdc-usdt-001", name: "USDC / USDT",
    token0Symbol: "USDT", token1Symbol: "USDC",
    feeTier: 100, feeLabel: "0.01%",
    defaultPrice: 1.0001, defaultVolume: 65_000_000,
    tvlUsd: 250_000_000, defaultRangePct: 0.001, annualVolatility: 0.02,
  },
  {
    id: "eth-btc-03", name: "ETH / BTC",
    token0Symbol: "ETH", token1Symbol: "BTC",
    feeTier: 3000, feeLabel: "0.3%",
    defaultPrice: 0.0625, defaultVolume: 12_000_000,
    tvlUsd: 35_000_000, defaultRangePct: 0.12, annualVolatility: 0.55,
  },
];

export const PRESET_MAP = new Map<string, PoolPreset>(
  PRESETS.map(p => [p.id, p]),
);
