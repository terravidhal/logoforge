import { optimize } from "svgo";

/**
 * SVG helpers for the import: optimization, safety checks, color analysis and
 * the automatic dark-mode variant. Pure string work — no DOM, no rasterizing.
 */

/** Optimize with SVGO: keep viewBox, drop width/height, prefix every id with the slug. */
export function optimizeSvg(svg: string, idPrefix: string) {
  return optimize(svg, {
    multipass: true,
    plugins: [
      {
        name: "preset-default",
        params: { overrides: { inlineStyles: { onlyMatchedOnce: false } } },
      },
      "removeDimensions",
      // Unique ids per logo: 12 logos on one page must not share gradient ids.
      { name: "prefixIds", params: { prefix: idPrefix, delim: "-" } },
    ],
  }).data;
}

const FORBIDDEN: [RegExp, string][] = [
  [/<script/i, "<script> element"],
  [/<foreignObject/i, "<foreignObject> element"],
  [/<image/i, "embedded <image>"],
  [/\son[a-z]+\s*=/i, "event handler attribute"],
  [/javascript:/i, "javascript: URL"],
  [/(?:xlink:)?href\s*=\s*"(?!#)/i, "external href"],
  [/url\((?!#)/i, "external url()"],
];

/**
 * Artwork lifted from a website carries its markup: site CSS classes, data-*
 * attributes, and sometimes `currentColor` (the page's text color). A color
 * file must stand alone: strip the site hooks (only when no <style> relies on
 * classes) and paint currentColor as black — the dark variant then turns it
 * white like any other black mark.
 */
export function standaloneColorSvg(svg: string) {
  let out = svg.replace(/(fill|stroke)="currentColor"/gi, '$1="#000"');
  if (!/<style/i.test(out)) {
    out = out.replace(/\s(?:class|data-[\w-]+)="[^"]*"/g, "");
  }
  return out;
}

/** Hard failures: anything that could execute or load remote content. */
export function securityIssues(svg: string) {
  return FORBIDDEN.filter(([re]) => re.test(svg)).map(([, label]) => label);
}

/** Soft warnings worth a human look in the review sheet. */
export function qualityWarnings(svg: string) {
  const warnings: string[] = [];
  if (/<style/i.test(svg)) warnings.push("keeps a <style> block");
  if (svg.length > 20_000) warnings.push(`large file (${Math.round(svg.length / 1024)} KB)`);
  if (!/viewBox=/.test(svg)) warnings.push("no viewBox");
  return warnings;
}

export function viewBoxAspect(svg: string) {
  const match = svg.match(/viewBox="([\d.\-\s]+)"/);
  if (!match) return 1;
  const [, , w, h] = match[1].trim().split(/\s+/).map(Number);
  return w && h ? w / h : 1;
}

// ── Colors ──────────────────────────────────────────────────────────────────

const HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;

function expand(hex: string) {
  const h = hex.replace("#", "").toLowerCase();
  return h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
}

export function luminance(hex: string) {
  const n = parseInt(expand(hex), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** The site's dark and light page backgrounds. */
export const DARK_BG = "#0a0a0a";
export const LIGHT_BG = "#ffffff";

/**
 * Shapes with no fill anywhere up the tree paint black by default. We can't
 * resolve inheritance without a DOM, so: a root without fill + a shape without
 * fill = assume implicit black (the review sheet confirms).
 */
function hasImplicitBlack(svg: string) {
  const root = svg.match(/<svg[^>]*>/)?.[0] ?? "";
  if (/\sfill=/.test(root)) return false;
  return /<(path|circle|rect|polygon|ellipse|polyline)(?![^>]*\sfill=)[^>]*>/i.test(svg);
}

/**
 * <mask> content is luminance data (white = visible), not paint: it must never
 * be recolored or counted as a logo color.
 */
const MASK = /<mask[\s\S]*?<\/mask>/gi;

/** Apply `fn` to every part of the SVG outside <mask> blocks. */
function outsideMasks(svg: string, fn: (part: string) => string) {
  let out = "";
  let last = 0;
  for (const m of svg.matchAll(MASK)) {
    out += fn(svg.slice(last, m.index)) + m[0];
    last = m.index! + m[0].length;
  }
  return out + fn(svg.slice(last));
}

export function colorsOf(svg: string) {
  const paint = svg.replace(MASK, "");
  const found = new Set((paint.match(HEX) ?? []).map((c) => `#${expand(c)}`));
  if (hasImplicitBlack(svg)) found.add("#000000");
  return [...found];
}

/** Minimum contrast for a logo on the dark page (WCAG non-text contrast). */
const MIN_DARK_CONTRAST = 3;

function toHsl(hex: string): [number, number, number] {
  const n = parseInt(expand(hex), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number) {
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return (
    "#" +
    [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)]
      .map((v) => Math.round(v * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Neutral = gray-ish or very dark (black, charcoal, navy text, dark brown):
 * it goes white, as brands do on dark — lightening it would give a muddy tint.
 */
function isNeutral(hex: string) {
  const [, s, l] = toHsl(hex);
  return s < 0.25 || l < 0.2;
}

/** Same hue, lighter, until it reads on the dark page. */
function lightenForDark(hex: string) {
  const [h, s, l0] = toHsl(hex);
  for (let l = l0; l <= 0.95; l += 0.03) {
    const candidate = fromHsl(h, s, l);
    if (contrast(candidate, DARK_BG) >= MIN_DARK_CONTRAST) return candidate;
  }
  return "#ffffff";
}

/** Same hue, darker, until it reads on the white page. */
function darkenForLight(hex: string) {
  const [h, s, l0] = toHsl(hex);
  for (let l = l0; l >= 0.05; l -= 0.03) {
    const candidate = fromHsl(h, s, l);
    if (contrast(candidate, LIGHT_BG) >= MIN_DARK_CONTRAST) return candidate;
  }
  return "#0a0a0a";
}

/**
 * Light-page variant for an ALL-light logo (e.g. Drizzle's lime): colors are
 * darkened, hue kept. The untouched original then serves as the dark variant.
 */
export function makeLightVariant(svg: string) {
  return outsideMasks(svg, (part) =>
    part.replace(HEX, (match) => darkenForLight(`#${expand(match)}`)),
  );
}

/** Colors that fail on the dark page (contrast < 3:1 against #0a0a0a). */
export function darkProblemColors(svg: string) {
  return colorsOf(svg).filter((c) => contrast(c, DARK_BG) < MIN_DARK_CONTRAST);
}

/** True when every color would vanish on a white page (an all-white logo). */
export function isAllLight(svg: string) {
  const colors = colorsOf(svg);
  return colors.length > 0 && colors.every((c) => contrast(c, LIGHT_BG) < 1.3);
}

export type DarkMode = "auto" | "swap" | "whiten";

/**
 * Dark-mode variant. Near-black neutrals become white, dark brand colors are
 * lightened (hue kept). "Knockout" marks — a black shape carrying white detail,
 * like Next.js or Notion — are SWAPPED (black↔white) so the detail survives.
 * Returns null when the logo already reads on dark.
 */
export function makeDarkVariant(svg: string, mode: DarkMode = "auto") {
  const problems = darkProblemColors(svg);
  if (problems.length === 0) return null;

  const colors = colorsOf(svg);
  const hasWhiteDetail = colors.some((c) => luminance(c) > 0.8);
  const hasBlackNeutral = problems.some((c) => isNeutral(c) && luminance(c) < 0.05);
  const swap = mode === "swap" || (mode === "auto" && hasWhiteDetail && hasBlackNeutral);

  const map = new Map<string, string>();
  for (const c of problems) map.set(c, isNeutral(c) ? "#ffffff" : lightenForDark(c));
  if (swap) {
    for (const c of colors) if (luminance(c) > 0.8) map.set(c, DARK_BG);
  }

  // One pass over explicit colors (masks untouched), so a swapped color is never re-mapped.
  const out = outsideMasks(svg, (part) =>
    part.replace(HEX, (match) => map.get(`#${expand(match)}`) ?? match),
  );
  // Implicit black (unfilled shapes) is recolored through the root fill, added
  // AFTER the pass — otherwise the swap would catch the fill we just wrote.
  return map.has("#000000") && hasImplicitBlack(svg)
    ? out.replace(/<svg/, `<svg fill="${map.get("#000000")}"`)
    : out;
}

/** Single-color version: every paint becomes currentColor (for sources without a mono file). */
export function makeMonoFromColor(svg: string) {
  let out = outsideMasks(svg, (part) =>
    part
      .replace(/(fill|stroke|stop-color)="(?!none)[^"]*"/gi, '$1="currentColor"')
      .replace(HEX, "currentColor"),
  );
  if (hasImplicitBlack(svg)) out = out.replace(/<svg/, '<svg fill="currentColor"');
  return out;
}

/**
 * Knockout mono for "badge" icons (symbol on a background shape): the shape is
 * painted in currentColor and the symbol is CUT OUT of it, through a mask —
 * the way brands draw their one-color versions. `bg` is the background color
 * measured by scripts/analyze.ts ("url" = a gradient background).
 */
export function makeMonoKnockout(svg: string, bg: string, maskId: string) {
  const vb = svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 24 24";
  const [x, y, w, h] = vb.trim().split(/[\s,]+/).map(Number);
  const rootTag = svg.match(/<svg[^>]*>/)?.[0] ?? "";
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

  // Same family as the background → visible (white in the mask); else → hole.
  const visible = (c: string) =>
    bg === "url" ? luminance(c) < 0.8 : contrast(c, `#${expand(bg)}`) < 1.5;
  const toMask = (c: string) => (visible(c) ? "#fff" : "#000");

  // Colors first, THEN gradients → white: the other order would turn the
  // white we just wrote into a hole.
  const mapped = outsideMasks(inner, (part) =>
    part
      .replace(HEX, (m) => toMask(`#${expand(m)}`))
      .replace(/(fill|stroke)="url\([^)]*\)"/gi, '$1="#fff"'),
  );
  // Unfilled shapes inherit the root fill (or black by default).
  const rootFill = rootTag.match(/\sfill="([^"]+)"/)?.[1];
  const inherited =
    rootFill === "none"
      ? "none"
      : toMask(rootFill && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(rootFill) ? rootFill : "#000000");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><defs>` +
    `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}">` +
    `<g fill="${inherited}">${mapped}</g></mask></defs>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="currentColor" mask="url(#${maskId})"/></svg>`
  );
}

/** Most frequent chromatic color — a fallback brand hex when Simple Icons has none. */
export function dominantColor(svg: string) {
  const counts = new Map<string, number>();
  for (const raw of svg.match(HEX) ?? []) {
    const c = `#${expand(raw)}`;
    const l = luminance(c);
    if (l < 0.02 || l > 0.9) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** A Simple Icons path as a standalone 24×24 SVG. */
export function svgFromPath(path: string, fill: string, title?: string) {
  const t = title ? `<title>${title.replace(/[<&]/g, "")}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}">${t}<path d="${path}"/></svg>`;
}
