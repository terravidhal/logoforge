/**
 * Logoforge analyze — finds "badge" icons (a symbol drawn on a background
 * shape: Adobe apps, AWS services, Emacs…) so their mono can be a knockout
 * instead of a solid blob. It renders each icon in headless Chrome and measures
 * whether the FIRST painted shape covers most of the logo.
 *
 *   npm run logos:analyze          (after logos:import; then import again)
 *
 * Writes data/backgrounds.json — reviewable data the import reads. Needs a
 * local Chrome (CHROME_PATH to override the default location).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { LogoRecord } from "./import";
import { ROOT } from "./lib/sources";

const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
/** The first shape must cover this share of the whole logo to count as a background… */
const MIN_COVERAGE = 0.6;
/** …and be a solid slab (square ≈ 1, circle ≈ 0.79), not a cluster of pieces. */
const MIN_SOLIDITY = 0.72;

const { logos } = JSON.parse(readFileSync(path.join(ROOT, "data", "logos.json"), "utf-8")) as {
  logos: LogoRecord[];
};
const derived = logos.filter((l) => l.sources["icon-mono"]?.origin.includes("derived"));

const cells = derived
  .map(
    (l) =>
      `<div class="c" data-slug="${l.slug}">${readFileSync(
        path.join(ROOT, "logos", l.slug, "icon.svg"),
        "utf-8",
      )}</div>`,
  )
  .join("");

// Runs in the page. coverage = first painted shape's box vs the union of all
// shapes; solidity = its opaque pixels vs its own box (rendered alone).
const probe = `
const SKIP = "defs, mask, clipPath, linearGradient, radialGradient, pattern, symbol";
const SHAPES = "path, rect, circle, ellipse, polygon, polyline";
const hex = (rgb) => { const m = rgb.match(/\\d+/g); return m ? "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("") : null; };
const painted = (svg) => [...svg.querySelectorAll(SHAPES)].filter((s) => !s.closest(SKIP) && getComputedStyle(s).fill !== "none");

function solidity(svg, index) {
  const clone = svg.cloneNode(true);
  painted(svg).forEach((_, i) => { if (i !== index) clone.querySelectorAll(SHAPES)[[...svg.querySelectorAll(SHAPES)].indexOf(painted(svg)[i])].setAttribute("display", "none"); });
  clone.setAttribute("width", "160"); clone.setAttribute("height", "160");
  const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 160; c.height = 160;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, 160, 160);
      const d = ctx.getImageData(0, 0, 160, 160).data;
      let n = 0, x0 = 160, y0 = 160, x1 = -1, y1 = -1;
      for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) if (d[(y * 160 + x) * 4 + 3] > 128) { n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      resolve(x1 < 0 ? 0 : n / ((x1 - x0 + 1) * (y1 - y0 + 1)));
    };
    img.onerror = () => resolve(0);
    img.src = src;
  });
}

(async () => {
  const out = [];
  for (const cell of document.querySelectorAll(".c")) {
    const svg = cell.querySelector("svg");
    svg.setAttribute("width", "200"); svg.setAttribute("height", "200");
    const shapes = painted(svg);
    if (shapes.length < 2) continue;
    const rects = shapes.map((s) => s.getBoundingClientRect());
    const u = rects.reduce((a, r) => ({ l: Math.min(a.l, r.left), t: Math.min(a.t, r.top), r: Math.max(a.r, r.right), b: Math.max(a.b, r.bottom) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 });
    const area = (u.r - u.l) * (u.b - u.t);
    const coverage = area > 0 ? (rects[0].width * rects[0].height) / area : 0;
    const fill = getComputedStyle(shapes[0]).fill;
    out.push({ slug: cell.dataset.slug, coverage: +coverage.toFixed(3), solidity: +(await solidity(svg, 0)).toFixed(3), color: fill.startsWith("url") ? "url" : hex(fill) });
  }
  const pre = document.createElement("pre"); pre.id = "out"; pre.textContent = JSON.stringify(out);
  document.body.replaceChildren(pre);
})();`;

const dir = mkdtempSync(path.join(tmpdir(), "logoforge-analyze-"));
const html = path.join(dir, "probe.html");
writeFileSync(html, `<!doctype html><html><body>${cells}<script>${probe}</script></body></html>`);

const dom = execFileSync(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    `--user-data-dir=${path.join(dir, "profile")}`,
    "--virtual-time-budget=30000",
    "--dump-dom",
    pathToFileURL(html).href,
  ],
  { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
);
const json = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)?.[1];
if (!json) throw new Error("Chrome returned no measurements");
const results = JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, "&")) as {
  slug: string;
  coverage: number;
  solidity: number;
  color: string | null;
}[];

if (process.env.DEBUG) for (const r of results) if (process.env.DEBUG.split(",").includes(r.slug)) console.log(JSON.stringify(r));
const backgrounds = Object.fromEntries(
  results
    .filter((r) => r.coverage >= MIN_COVERAGE && r.solidity >= MIN_SOLIDITY && r.color)
    .map((r) => [r.slug, { color: r.color, coverage: r.coverage, solidity: r.solidity }]),
);

writeFileSync(
  path.join(ROOT, "data", "backgrounds.json"),
  JSON.stringify(
    {
      $comment:
        "GENERATED by scripts/analyze.ts — icons whose first shape is a background. Their derived mono is a knockout (symbol cut out of the shape). Remove an entry to opt out.",
      logos: backgrounds,
    },
    null,
    2,
  ) + "\n",
);
console.log(`✓ ${derived.length} derived monos measured · ${Object.keys(backgrounds).length} backgrounds found`);
