import { SNAPSHOT_POLL_INTERVAL_MS } from "../constants";
import { fetchPositionsFresh } from "./tracker";
import { listWatched, markPolled, pruneOldSnapshots, recordSnapshots } from "./history";

// Periodically refreshes watched wallets so in-range history keeps accruing
// even when nobody has the page open.

let timer: NodeJS.Timeout | null = null;
let running = false;

async function pollOnce(): Promise<void> {
  if (running) return;            // never overlap runs
  running = true;
  try {
    const watched = listWatched();
    if (!watched.length) return;

    let snapshots = 0;
    // Serial on purpose — polling is a background task, not a latency path,
    // and The Graph is metered per query.
    for (const w of watched) {
      try {
        const positions = await fetchPositionsFresh(w.network, w.address);
        snapshots += recordSnapshots(positions);
        markPolled(w.address, w.network);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        markPolled(w.address, w.network, msg);
        console.error(`[poller] ${w.address} on ${w.network}: ${msg}`);
      }
    }

    const pruned = pruneOldSnapshots();
    console.log(
      `[poller] ${watched.length} wallet(s) polled, ${snapshots} snapshot(s) recorded` +
      (pruned ? `, ${pruned} pruned` : ""),
    );
  } catch (e) {
    console.error("[poller] run failed:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

export function startPoller(intervalMs = SNAPSHOT_POLL_INTERVAL_MS): void {
  if (timer) return;
  // Small delay so a restart doesn't fire a burst of queries during boot
  setTimeout(() => { void pollOnce(); }, 5_000);
  timer = setInterval(() => { void pollOnce(); }, intervalMs);
  timer.unref?.();
  console.log(`[poller] started — every ${Math.round(intervalMs / 60_000)} min`);
}

export function stopPoller(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

// Exposed so a wallet that was just added starts collecting immediately
export { pollOnce };
