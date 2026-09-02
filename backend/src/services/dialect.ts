import { Dialect } from "../constants";

// The V3 forks share one schema apart from a few names: Algebra calls the fee
// `fee` (it is dynamic) and prices in MATIC; HyperSwap prices in its native
// token; V4 is identical to V3 here. Rather than normalise responses after
// the fact, every query aliases the differing field to one internal name, so
// the response shape -- and every type downstream -- is the same for all of
// them: `feeTier`, `derivedNative`, `nativePriceUSD`.

interface DialectFields {
  fee:         string;
  derived:     string;
  bundlePrice: string;
  // Extra filter on the top-pools page. V4's TVL ordering is dominated by
  // junk pairs whose fabricated prices put them in the trillions; a swap
  // count separates pools that trade from pools that merely exist. Older
  // graph-node deployments reject `where` on this query, so it is per dialect.
  poolsWhere:  string;
}

const DIALECTS: Record<Dialect, DialectFields> = {
  v3:        { fee: "feeTier", derived: "derivedETH",    bundlePrice: "ethPriceUSD",    poolsWhere: "" },
  v4:        { fee: "feeTier", derived: "derivedETH",    bundlePrice: "ethPriceUSD",    poolsWhere: "where: { txCount_gte: 1000 }" },
  hyperswap: { fee: "feeTier", derived: "derivedNative", bundlePrice: "nativePriceUSD", poolsWhere: "" },
  algebra:   { fee: "fee",     derived: "derivedMatic",  bundlePrice: "maticPriceUSD",  poolsWhere: "" },
};

export const tokenFields  = (d: Dialect) => `id symbol decimals derivedNative: ${DIALECTS[d].derived}`;
export const poolFeeField = (d: Dialect) => `feeTier: ${DIALECTS[d].fee}`;
export const bundleQuery  = (d: Dialect) => `bundle(id: "1") { nativePriceUSD: ${DIALECTS[d].bundlePrice} }`;
export const poolsWhere   = (d: Dialect) => DIALECTS[d].poolsWhere;
