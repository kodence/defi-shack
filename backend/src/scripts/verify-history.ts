// Verifies the pure in-range / retention computation against synthetic
// snapshot series. Run with: npm run verify:history
import { computeHistory } from "../services/history";

type Row = {
  ts: number; in_range: number; price: number; value_usd: number;
  unclaimed_usd: number; dl_usd: number; net_vs_hodl: number;
};

const row = (ts: number, inRange: number, unclaimed = 0, net = 0): Row => ({
  ts, in_range: inRange, price: 2000, value_usd: 10000,
  unclaimed_usd: unclaimed, dl_usd: -50, net_vs_hodl: net,
});

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${a}${ok ? "" : ` (expected ${e})`}`);
}

// A — 5 snapshots 15 min apart, all in range, last extends to now
const a = computeHistory(
  [0, 900, 1800, 2700, 3600].map(t => row(t, 1)), 4500,
)!;
check("A inRangePct (all in range)", a.inRangePct, 1);
check("A observedSeconds", a.observedSeconds, 4500);
check("A coverage", a.coverage, 1);
check("A gapSeconds", a.gapSeconds, 0);

// B — first three in range, last two out
const b = computeHistory(
  [row(0, 1), row(900, 1), row(1800, 1), row(2700, 0), row(3600, 0)], 4500,
)!;
check("B inRangePct (3 of 5 in range)", b.inRangePct, 0.6);
check("B inRangeSeconds", b.inRangeSeconds, 2700);

// C — long gap in the middle must not be attributed to the last known state
const c = computeHistory(
  [row(0, 1), row(900, 1), row(50_000, 1), row(50_900, 1)], 51_800,
)!;
check("C observedSeconds (gap excluded)", c.observedSeconds, 2700);
check("C gapSeconds", c.gapSeconds, 49_100);
check("C inRangePct", c.inRangePct, 1);
check("C coverage < 6%", c.coverage < 0.06, true);

// D — a single recent snapshot extends to now; a single stale one does not
const dFresh = computeHistory([row(0, 1)], 1000)!;
check("D fresh single observed", dFresh.observedSeconds, 1000);
check("D fresh single inRangePct", dFresh.inRangePct, 1);
const dStale = computeHistory([row(0, 1)], 100_000)!;
check("D stale single observed", dStale.observedSeconds, 0);
check("D stale single inRangePct", dStale.inRangePct, null);

// E — earnings-retention trend (doc section L)
const e = computeHistory(
  [row(0, 1, 100, 20), row(900, 1, 150, 40), row(1800, 1, 200, 60)], 2700,
)!;
check("E retention direction", e.retentionTrend?.direction, "up");
check("E retention first", e.retentionTrend?.first, 0.2);
check("E retention last", e.retentionTrend?.last, 0.3);

// F — empty history
check("F empty returns null", computeHistory([], 1000), null);

// G — out-of-order-free ordering assumption: zero-length intervals ignored
const g = computeHistory([row(100, 1), row(100, 0), row(1000, 1)], 1900)!;
check("G duplicate timestamps ignored", g.observedSeconds, 1800);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
