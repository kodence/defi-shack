import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";

// Local SQLite store for position history. Uses node:sqlite (built into Node
// 22.5+), so there is no native module to compile.

const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_PATH = process.env.DEFISHACK_DB_PATH ?? path.join(DATA_DIR, "defishack.db");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;

  if (DB_PATH !== ":memory:") {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const handle = new DatabaseSync(DB_PATH);

  // WAL keeps the background poller's writes from blocking API reads
  handle.exec("PRAGMA journal_mode = WAL");
  handle.exec("PRAGMA synchronous = NORMAL");
  handle.exec("PRAGMA busy_timeout = 5000");

  handle.exec(`
    CREATE TABLE IF NOT EXISTS watched_wallets (
      address     TEXT    NOT NULL,
      network     TEXT    NOT NULL,
      added_at    INTEGER NOT NULL,
      last_polled INTEGER,
      last_error  TEXT,
      PRIMARY KEY (address, network)
    );

    CREATE TABLE IF NOT EXISTS position_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      network       TEXT    NOT NULL,
      position_id   TEXT    NOT NULL,
      owner         TEXT    NOT NULL,
      ts            INTEGER NOT NULL,
      in_range      INTEGER NOT NULL,
      price         REAL    NOT NULL,
      lower_price   REAL    NOT NULL,
      upper_price   REAL    NOT NULL,
      value_usd     REAL    NOT NULL,
      unclaimed_usd REAL    NOT NULL,
      dl_usd        REAL    NOT NULL,
      net_vs_hodl   REAL    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_position
      ON position_snapshots (network, position_id, ts);
    CREATE INDEX IF NOT EXISTS idx_snapshots_owner
      ON position_snapshots (owner, ts);
  `);

  db = handle;
  return handle;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

export { DB_PATH };
