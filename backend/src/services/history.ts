import { getDb } from "./db";
import {
  SNAPSHOT_MAX_GAP_SEC, SNAPSHOT_MIN_INTERVAL_SEC, SNAPSHOT_RETENTION_DAYS,
} from "../constants";
import { PositionHistory, HistoryPoint, TrackedPosition } from "../types/track";

// ── Recording ─────────────────────────────────────────────────────────────────

interface SnapshotRow {
  ts: number;
  in_range: number;
  price: number;
  value_usd: number;
  unclaimed_usd: number;
  dl_usd: number;
  net_vs_hodl: number;
}

// Write one snapshot per position, debounced so repeated lookups of the same
// wallet don't spam rows. Returns how many were actually written.
export function recordSnapshots(positions: TrackedPosition[], nowSec?: number): number {
  if (!positions.length) return 0;
  const db = getDb();
  const now = nowSec ?? Math.floor(Date.now() / 1000);

  const lastTsStmt = db.prepare(
    `SELECT ts FROM position_snapshots
      WHERE network = ? AND position_id = ?
      ORDER BY ts DESC LIMIT 1`,
  );
  const insert = db.prepare(
    `INSERT INTO position_snapshots
       (network, position_id, owner, ts, in_range, price, lower_price, upper_price,
        value_usd, unclaimed_usd, dl_usd, net_vs_hodl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let written = 0;
  for (const p of positions) {
    const last = lastTsStmt.get(p.network, p.positionId) as { ts: number } | undefined;
    if (last && now - last.ts < SNAPSHOT_MIN_INTERVAL_SEC) continue;
    insert.run(
      p.network, p.positionId, p.owner, now,
      p.inRange ? 1 : 0,          // node:sqlite rejects JS booleans
      p.currentPrice, p.lowerPrice, p.upperPrice,
      p.positionValueUsd, p.earnings.totalUsd,
      p.divergenceLossUsd, p.netVsHodlUsd,
    );
    written++;
  }
  return written;
}

export function pruneOldSnapshots(nowSec?: number): number {
  const db = getDb();
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const cutoff = now - SNAPSHOT_RETENTION_DAYS * 86_400;
  const res = db.prepare("DELETE FROM position_snapshots WHERE ts < ?").run(cutoff);
  return Number(res.changes);
}

// ── Reading ───────────────────────────────────────────────────────────────────

export function getHistory(
  network: string, positionId: string, nowSec?: number,
): PositionHistory | null {
  const db = getDb();
  const rows = db.prepare(
    `SELECT ts, in_range, price, value_usd, unclaimed_usd, dl_usd, net_vs_hodl
       FROM position_snapshots
      WHERE network = ? AND position_id = ?
      ORDER BY ts ASC`,
  ).all(network, positionId) as unknown as SnapshotRow[];

  return computeHistory(rows, nowSec ?? Math.floor(Date.now() / 1000));
}

const MAX_SERIES_POINTS = 60;

// Time-weighted in-range share. Each snapshot's state is held until the next
// one (a step function); gaps longer than SNAPSHOT_MAX_GAP_SEC are treated as
// unobserved instead of being attributed to the last known state.
export function computeHistory(rows: SnapshotRow[], now: number): PositionHistory | null {
  if (!rows.length) return null;

  let observed = 0;
  let inRange = 0;
  let gap = 0;

  for (let i = 0; i < rows.length; i++) {
    const start = rows[i].ts;
    const end = i + 1 < rows.length ? rows[i + 1].ts : now;
    const dt = end - start;
    if (dt <= 0) continue;
    if (dt > SNAPSHOT_MAX_GAP_SEC) {
      gap += dt;
      continue;
    }
    observed += dt;
    if (rows[i].in_range) inRange += dt;
  }

  const firstTs = rows[0].ts;
  const lastTs = rows[rows.length - 1].ts;
  const window = Math.max(now - firstTs, 0);

  // Earnings retention = net vs HODL ÷ earnings (doc section L)
  const retentionOf = (r: SnapshotRow): number | null =>
    r.unclaimed_usd > 0 ? r.net_vs_hodl / r.unclaimed_usd : null;

  const withRetention = rows
    .map(r => ({ ts: r.ts, retention: retentionOf(r) }))
    .filter((x): x is { ts: number; retention: number } => x.retention !== null);

  let retentionTrend: PositionHistory["retentionTrend"] = null;
  if (withRetention.length >= 2) {
    const first = withRetention[0].retention;
    const last = withRetention[withRetention.length - 1].retention;
    const delta = last - first;
    retentionTrend = {
      first, last, delta,
      direction: Math.abs(delta) < 0.01 ? "flat" : delta > 0 ? "up" : "down",
    };
  }

  // Downsample evenly for the sparkline
  const step = Math.max(1, Math.ceil(rows.length / MAX_SERIES_POINTS));
  const series: HistoryPoint[] = [];
  for (let i = 0; i < rows.length; i += step) {
    const r = rows[i];
    series.push({
      ts: r.ts,
      inRange: r.in_range === 1,
      price: r.price,
      valueUsd: r.value_usd,
      unclaimedUsd: r.unclaimed_usd,
      retention: retentionOf(r),
    });
  }
  const lastRow = rows[rows.length - 1];
  if (series[series.length - 1]?.ts !== lastRow.ts) {
    series.push({
      ts: lastRow.ts,
      inRange: lastRow.in_range === 1,
      price: lastRow.price,
      valueUsd: lastRow.value_usd,
      unclaimedUsd: lastRow.unclaimed_usd,
      retention: retentionOf(lastRow),
    });
  }

  return {
    snapshots: rows.length,
    firstTs, lastTs,
    observedSeconds: observed,
    inRangeSeconds: inRange,
    gapSeconds: gap,
    inRangePct: observed > 0 ? inRange / observed : null,
    coverage: window > 0 ? Math.min(observed / window, 1) : 0,
    retentionTrend,
    series,
  };
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export interface WatchedWallet {
  address:    string;
  network:    string;
  addedAt:    number;
  lastPolled: number | null;
  lastError:  string | null;
}

export function addWatch(address: string, networks: string[]): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(
    `INSERT INTO watched_wallets (address, network, added_at)
     VALUES (?, ?, ?)
     ON CONFLICT (address, network) DO NOTHING`,
  );
  for (const n of networks) stmt.run(address.toLowerCase(), n, now);
}

export function removeWatch(address: string, networks?: string[]): void {
  const db = getDb();
  if (networks?.length) {
    const stmt = db.prepare("DELETE FROM watched_wallets WHERE address = ? AND network = ?");
    for (const n of networks) stmt.run(address.toLowerCase(), n);
  } else {
    db.prepare("DELETE FROM watched_wallets WHERE address = ?").run(address.toLowerCase());
  }
}

export function listWatched(address?: string): WatchedWallet[] {
  const db = getDb();
  const rows = address
    ? db.prepare("SELECT * FROM watched_wallets WHERE address = ? ORDER BY network").all(address.toLowerCase())
    : db.prepare("SELECT * FROM watched_wallets ORDER BY address, network").all();
  return (rows as unknown as {
    address: string; network: string; added_at: number;
    last_polled: number | null; last_error: string | null;
  }[]).map(r => ({
    address: r.address,
    network: r.network,
    addedAt: r.added_at,
    lastPolled: r.last_polled,
    lastError: r.last_error,
  }));
}

export function markPolled(address: string, network: string, error?: string): void {
  const db = getDb();
  db.prepare("UPDATE watched_wallets SET last_polled = ?, last_error = ? WHERE address = ? AND network = ?")
    .run(Math.floor(Date.now() / 1000), error ?? null, address.toLowerCase(), network);
}
