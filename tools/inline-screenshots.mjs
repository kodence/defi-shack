// Embeds tools/screenshots/*.png into the guide as data URIs.
//
//   node tools/inline-screenshots.mjs
//
// Artifacts are published as a single HTML file behind a CSP that blocks
// external hosts, so images have to travel inside the document.
//
// Each figure is declared in the guide as a placeholder comment:
//
//   <!--FIG:name|wide|Caption, may contain inline HTML.-->
//
// The placeholder is kept in the output and any figure already following it is
// replaced, so this can be re-run after re-capturing without editing by hand.

import { readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUIDE = path.join(HERE, "..", "frontend", "public", "user-guide.html");
const SHOTS = path.join(HERE, "screenshots");

// Width and height live in the PNG's IHDR chunk, right after the signature.
const pngWidth = (buf) => buf.readUInt32BE(16);

const stripTags = (s) => s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

let html = readFileSync(GUIDE, "utf8");
const before = Buffer.byteLength(html);

const PLACEHOLDER = /(<!--FIG:([a-z0-9-]+)\|([a-z-]*)\|([\s\S]*?)-->)(\s*<figure class="fig[\s\S]*?<\/figure>)?/g;

let count = 0;
html = html.replace(PLACEHOLDER, (_match, comment, name, cls, caption) => {
  const file = path.join(SHOTS, `${name}.png`);
  const buf = readFileSync(file);
  // Captures are 2x, so half the pixel width is the size it was designed at.
  const cssWidth = Math.round(pngWidth(buf) / 2);
  const wide = cls.includes("wide") ? " fig--wide" : "";
  const alt = stripTags(caption);
  count++;
  console.log(`  ${name}.png -> ${(statSync(file).size / 1024).toFixed(0)} KB, ${cssWidth}px wide`);
  return `${comment}
        <figure class="fig${wide}">
          <img alt="${alt}" style="max-width: ${cssWidth}px"
               src="data:image/png;base64,${buf.toString("base64")}">
          <figcaption>${caption.trim()}</figcaption>
        </figure>`;
});

writeFileSync(GUIDE, html);
const after = Buffer.byteLength(html);
console.log(`\n${count} figure(s) inlined. Guide ${(before / 1024).toFixed(0)} KB -> ${(after / 1024 / 1024).toFixed(2)} MB`);
