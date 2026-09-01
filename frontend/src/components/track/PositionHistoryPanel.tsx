"use client";

import { PositionHistory } from "@/types/track";

interface Props {
  history:  PositionHistory | null;
  watched:  boolean;
  pollMins: number;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const MAX_GAP_SEC = 90 * 60;   // mirrors SNAPSHOT_MAX_GAP_SEC on the backend

// Time-proportional strip: green while in range, red while out, grey for
// stretches nobody observed.
function Timeline({ history }: { history: PositionHistory }) {
  const { series, firstTs, lastTs } = history;
  const span = lastTs - firstTs;
  if (span <= 0 || series.length < 2) return null;

  const H = 18;
  const segments = series.slice(0, -1).map((pt, i) => {
    const next = series[i + 1];
    const dt = next.ts - pt.ts;
    const x = ((pt.ts - firstTs) / span) * 100;
    const w = (dt / span) * 100;
    const fill = dt > MAX_GAP_SEC ? "#dbdbdb" : pt.inRange ? "#48c78e" : "#f14668";
    return <rect key={pt.ts} x={`${x}%`} y={0} width={`${w}%`} height={H} fill={fill} />;
  });

  return (
    <svg width="100%" height={H} style={{ display: "block", borderRadius: "3px", overflow: "hidden" }}>
      <rect x={0} y={0} width="100%" height={H} fill="#f5f5f5" />
      {segments}
    </svg>
  );
}

function RetentionSpark({ history }: { history: PositionHistory }) {
  const pts = history.series.filter(p => p.retention !== null);
  if (pts.length < 2) return null;

  const W = 100, H = 24;
  const first = pts[0].ts, span = pts[pts.length - 1].ts - first;
  if (span <= 0) return null;
  const vals = pts.map(p => p.retention!);
  const lo = Math.min(...vals, 0), hi = Math.max(...vals, 1);
  const range = hi - lo || 1;

  const d = pts.map((p, i) => {
    const x = ((p.ts - first) / span) * W;
    const y = H - ((p.retention! - lo) / range) * H;
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");

  const zeroY = H - ((0 - lo) / range) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      width="100%" height={H} style={{ display: "block" }}>
      {zeroY >= 0 && zeroY <= H && (
        <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#dbdbdb" strokeWidth="0.5" strokeDasharray="2 2" />
      )}
      <path d={d} fill="none" stroke="#485fc7" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function PositionHistoryPanel({ history, watched, pollMins }: Props) {
  // Nothing recorded yet, or only the single point from this page load
  if (!history || history.snapshots < 2 || history.inRangePct === null) {
    return (
      <div className="mt-2 p-2" style={{ background: "#f6f8fa", borderRadius: "6px" }}>
        <p className="heading mb-1">In-range time</p>
        <p className="is-size-7 has-text-grey">
          {history ? `${history.snapshots} snapshot(s) recorded — ` : "No history yet — "}
          {watched
            ? `collecting every ${pollMins} min. Check back once a couple of intervals have passed.`
            : "click Watch above to record history in the background."}
        </p>
      </div>
    );
  }

  const pct = history.inRangePct;
  const tone = pct >= 0.9 ? "has-text-success" : pct >= 0.6 ? "has-text-warning-dark" : "has-text-danger";
  const trend = history.retentionTrend;

  return (
    <div className="mt-2 p-2" style={{ background: "#f6f8fa", borderRadius: "6px" }}>
      <div className="is-flex is-align-items-baseline mb-1" style={{ gap: "0.5rem" }}>
        <p className="heading mb-0">In-range time</p>
        <strong className={tone}>{(pct * 100).toFixed(1)}%</strong>
        <span className="is-size-7 has-text-grey">
          over {fmtDuration(history.observedSeconds)} observed
        </span>
      </div>

      <Timeline history={history} />

      <p className="is-size-7 has-text-grey mt-1">
        {history.snapshots} snapshots · coverage {(history.coverage * 100).toFixed(0)}%
        {history.gapSeconds > 0 && ` · ${fmtDuration(history.gapSeconds)} unobserved`}
        {!watched && " · not currently watched"}
      </p>

      {trend && (
        <div className="mt-2">
          <div className="is-flex is-align-items-baseline" style={{ gap: "0.5rem" }}>
            <p className="heading mb-0">Earnings retention</p>
            <strong className={trend.direction === "up" ? "has-text-success" : trend.direction === "down" ? "has-text-danger" : ""}>
              {(trend.last * 100).toFixed(0)}%
            </strong>
            <span className="is-size-7 has-text-grey">
              {trend.direction === "flat"
                ? "flat"
                : `${trend.direction === "up" ? "▲" : "▼"} from ${(trend.first * 100).toFixed(0)}%`}
            </span>
          </div>
          <RetentionSpark history={history} />
        </div>
      )}
    </div>
  );
}
