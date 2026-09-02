// Stops everything `npm run dev` started.
//
//   npm run dev:stop
//
// Ctrl+C is unreliable here on Windows: concurrently reaches next-server and
// tsx through npm's cmd shims, and those routinely fail to forward the console
// signal, so the grandchildren survive still holding ports 3000/3001. Killing
// the parent does not help either -- Stop-Process has no tree kill, so it just
// orphans them. taskkill /T does, which is what this uses.

import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTS = [3000, 3001];
const isWindows = process.platform === "win32";

const killed = new Set();

function treeKill(pid, why) {
  if (!pid || killed.has(pid) || Number(pid) === process.pid) return;
  try {
    if (isWindows) {
      execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    } else {
      // Kill the process group where there is one, else just the process
      try { process.kill(-Number(pid), "SIGKILL"); }
      catch { process.kill(Number(pid), "SIGKILL"); }
    }
    killed.add(pid);
    console.log(`  killed ${pid}  (${why})`);
  } catch {
    // Already gone, or a child taskkill reaped as part of an earlier tree
  }
}

// ── Whatever is listening on the dev ports ───────────────────────────────────
function pidsOnPort(port) {
  const pids = new Set();
  try {
    if (isWindows) {
      // Proto  Local Address  Foreign Address  State  PID
      for (const line of execSync("netstat -ano -p tcp", { encoding: "utf8" }).split("\n")) {
        const f = line.trim().split(/\s+/);
        if (f.length >= 5 && /^LISTENING$/i.test(f[3]) && f[1].endsWith(`:${port}`)) {
          pids.add(f[4]);
        }
      }
    } else {
      const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: "utf8" });
      out.split("\n").filter(Boolean).forEach((p) => pids.add(p.trim()));
    }
  } catch {
    // netstat/lsof unavailable, or nothing bound
  }
  return [...pids];
}

// ── Dev processes belonging to this repo, port-bound or not ──────────────────
// Catches the concurrently parent and the npm shims, which hold no port and so
// would otherwise linger and keep respawning under tsx watch.
function repoDevPids() {
  const pids = new Set();
  try {
    if (isWindows) {
      const ps = [
        "Get-CimInstance Win32_Process",
        // -like treats backslashes literally, so the path must NOT be escaped
        "| Where-Object { $_.CommandLine -and $_.CommandLine -like '*" + REPO + "*'",
        "  -and $_.CommandLine -match 'concurrently|next|tsx' }",
        "| ForEach-Object { $_.ProcessId }",
      ].join(" ");
      execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: "utf8" })
        .split("\n").map((l) => l.trim()).filter(Boolean)
        .forEach((p) => pids.add(p));
    } else {
      execSync(`pgrep -f "${REPO}"`, { encoding: "utf8" })
        .split("\n").map((l) => l.trim()).filter(Boolean)
        .forEach((p) => pids.add(p));
    }
  } catch {
    // No matches, or the query tool is unavailable
  }
  return [...pids];
}

console.log("Stopping dev servers...");

for (const port of PORTS) {
  for (const pid of pidsOnPort(port)) treeKill(pid, `port ${port}`);
}
for (const pid of repoDevPids()) treeKill(pid, "dev process");

// Report what, if anything, is still bound
const stillUp = PORTS.filter((p) => pidsOnPort(p).length > 0);
if (killed.size === 0) {
  console.log("  nothing was running");
} else if (stillUp.length) {
  console.log(`\nStill listening on ${stillUp.join(", ")} -- rerun, or check for a second dev server.`);
  process.exitCode = 1;
} else {
  console.log(`\nStopped. Ports ${PORTS.join(", ")} are free.`);
}
