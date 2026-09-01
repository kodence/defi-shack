// Captures the figures used in frontend/public/user-guide.html.
//
// Drives a headless Chrome over the DevTools protocol so each figure can be
// clipped to a single panel rather than a whole viewport. Both servers must be
// running (npm run dev) before this is used.
//
//   node tools/capture-screenshots.mjs
//
// Output: tools/screenshots/*.png at 2x for legible text.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "screenshots");
const APP = process.env.LPSIM_APP ?? "http://localhost:3000";
const PORT = Number(process.env.CDP_PORT ?? 9223);
const CHROME = process.env.CHROME_PATH
  ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// A live crypto-crypto pool: correlation and divergence scenarios are richer
// than a stable-quoted pair, so the panels show their full behaviour.
const POOL_A = "/simulator?network=ethereum&pool=0x4585fe77225b41b697c938b018e2ac67ac5a20c0";
const POOL_B = "/simulator?network=ethereum&pool=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

// ── Minimal CDP client over Node's native WebSocket ──────────────────────────
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", () => rej(new Error("CDP socket failed")), { once: true });
    });
    return new Cdp(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 120_000);
    });
  }

  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result?.value;
  }

  async goto(url) {
    await this.send("Page.navigate", { url });
    await sleep(700);
    for (let i = 0; i < 100; i++) {
      if (await this.eval("document.readyState === 'complete'")) return;
      await sleep(200);
    }
  }

  // Poll until a selector exists (charts and tables arrive after a fetch)
  async waitFor(selector, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = await this.eval(`!!document.querySelector(${JSON.stringify(selector)})`);
      if (found) { await sleep(500); return true; }
      await sleep(400);
    }
    throw new Error(`timed out waiting for ${selector}`);
  }

  // The simulator scrolls inside `main` rather than the document, so
  // captureBeyondViewport would relayout and move the target. Instead the
  // viewport is made tall enough to hold the whole page and the clip is taken
  // straight from viewport coordinates.
  async shot(name, selector, { pad = 12, maxHeight = 0 } = {}) {
    const rect = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'start' });
      return null;
    })(), (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })()`);
    if (!rect) throw new Error(`no element for ${selector}`);
    await sleep(500);

    const height = maxHeight ? Math.min(rect.h + pad * 2, maxHeight) : rect.h + pad * 2;
    const { data } = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      clip: {
        x: Math.max(rect.x - pad, 0),
        y: Math.max(rect.y - pad, 0),
        width: rect.w + pad * 2,
        height,
        scale: 1,
      },
    });
    const file = path.join(OUT_DIR, `${name}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`  saved ${name}.png (${(Buffer.from(data, "base64").length / 1024).toFixed(0)} KB)`);
  }
}

// ── Launch ────────────────────────────────────────────────────────────────────
async function launch() {
  const proc = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--disable-extensions",
    `--remote-debugging-port=${PORT}`,
    // Kept out of the repo; it is ~60 MB of Chrome profile
    `--user-data-dir=${path.join(tmpdir(), "lpsim-capture-profile")}`,
    "about:blank",
  ], { stdio: "ignore" });

  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return proc;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  proc.kill();
  throw new Error("Chrome did not expose a debugging port");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const proc = await launch();

  try {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = targets.find(t => t.type === "page");
    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    // Tall enough that no page needs to scroll internally while clipping
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1460, height: 2600, deviceScaleFactor: 2, mobile: false,
    });

    // ── Discovery ────────────────────────────────────────────────────────────
    console.log("Discovery (first load fetches every pool, this is slow)...");
    await cdp.goto(`${APP}/`);
    await cdp.waitFor("table tbody tr:nth-child(5)", 180_000);
    await cdp.shot("discovery", ".container.is-fluid", { maxHeight: 620 });

    // ── Simulator ────────────────────────────────────────────────────────────
    console.log("Simulator...");
    await cdp.goto(`${APP}${POOL_A}`);
    await cdp.waitFor("svg");
    await sleep(2500);
    // querySelectorAll returns document order, so the last div whose text starts
    // with a panel's title is the title element itself; its parent is the card.
    await cdp.eval(`(() => {
      window.__mark = (t, k) => {
        const c = [...document.querySelectorAll('div')]
          .filter(d => d.textContent.trim().startsWith(t));
        if (!c.length) return false;
        const card = c[c.length - 1].parentElement;
        card.setAttribute('data-shot', k);
        return true;
      };
      __mark('Liquidity distribution', 'liq');
      __mark('Divergence loss', 'dl');
      __mark('VALID checklist', 'valid');
      return true;
    })()`);
    await cdp.shot("metric-cards", "main > div:first-of-type", { pad: 10 });
    await cdp.shot("apr-panel", "aside", { maxHeight: 1400 });
    await cdp.shot("liquidity", '[data-shot="liq"]');
    await cdp.shot("divergence", '[data-shot="dl"]');
    await cdp.shot("valid", '[data-shot="valid"]');

    // ── Portfolio: save two real positions through the UI ─────────────────────
    console.log("Portfolio...");
    // The headless profile persists between runs, so start from an empty
    // portfolio or repeated runs stack duplicate positions into the figure.
    await cdp.eval(`(() => { localStorage.removeItem('lpsim.portfolio.v1'); return true; })()`);
    const addToPortfolio = async () => {
      await cdp.eval(`(() => {
        const b = [...document.querySelectorAll('button')]
          .find(x => x.textContent.includes('Add to portfolio'));
        if (b) b.click();
      })()`);
      await sleep(600);
    };
    await addToPortfolio();
    await cdp.goto(`${APP}${POOL_B}`);
    await cdp.waitFor("svg");
    await sleep(2500);
    await addToPortfolio();

    await cdp.goto(`${APP}/portfolio`);
    await cdp.waitFor("table tbody tr");
    await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => x.textContent.includes('Run stress test'));
      if (b) b.click();
    })()`);
    await sleep(6000);
    await cdp.shot("portfolio", ".container.is-fluid", { maxHeight: 900 });

    // ── Track ────────────────────────────────────────────────────────────────
    console.log("Track...");
    await cdp.goto(`${APP}/track`);
    await sleep(800);
    const wallet = process.env.LPSIM_DEMO_WALLET;
    if (wallet) {
      await cdp.eval(`(() => {
        const i = document.querySelector('input[placeholder^="Wallet address"]');
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(i, ${JSON.stringify(wallet)});
        i.dispatchEvent(new Event('input', { bubbles: true }));
        [...document.querySelectorAll('button')]
          .find(b => b.textContent.includes('Load positions'))?.click();
      })()`);
      await cdp.waitFor(".column.is-half .box", 120_000);
      await sleep(1500);
      await cdp.shot("track-card", ".column.is-half .box", { maxHeight: 1100 });
      // Only a position with recorded history renders the timeline SVG, so
      // that is the panel worth showing.
      await cdp.eval(`(() => {
        const p = [...document.querySelectorAll('div')]
          .filter(d => d.textContent.trim().startsWith('In-range time') && d.querySelector('svg'));
        if (p.length) p[0].setAttribute('data-shot', 'hist');
        return p.length;
      })()`);
      await cdp.shot("in-range-history", '[data-shot="hist"]')
        .catch(e => console.log("  (skipped history:", e.message + ")"));
    } else {
      console.log("  (set LPSIM_DEMO_WALLET to capture Track figures)");
    }

    console.log(`\nDone. Files in ${OUT_DIR}`);
  } finally {
    proc.kill();
  }
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
