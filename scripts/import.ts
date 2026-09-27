/**
 * Logoforge import — builds logos/<slug>/*.svg + data/logos.json from CC0 sources.
 *
 *   npm run logos:import            (from the site root)
 *
 * Per logo, variants come from:
 *   icon       gilbarbara `<gb>-icon.svg`, else a square gilbarbara file, else the
 *              Simple Icons path filled with its brand hex
 *   icon-mono  the Simple Icons path in currentColor, else derived from the icon
 *   wordmark   the wide gilbarbara file (aspect > 1.4), when there is one
 *   *-dark     automatic: near-black colors turned white (only when needed)
 * Every file is optimized (SVGO, ids prefixed with the slug) and rejected if it
 * could execute or load anything. Output is fully regenerated on each run.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertSimpleIconsVersion,
  gilbarbara,
  readJson,
  ROOT,
  simpleIcon,
  type Lock,
} from "./lib/sources";
import {
  dominantColor,
  isAllLight,
  makeDarkVariant,
  makeLightVariant,
  makeMonoFromColor,
  makeMonoKnockout,
  optimizeSvg,
  qualityWarnings,
  securityIssues,
  standaloneColorSvg,
  svgFromPath,
  viewBoxAspect,
  type DarkMode,
} from "./lib/svg";
import { buildComponent } from "./lib/component";
import { componentName, SITE_URL } from "./lib/names";

type Curated = {
  slug: string;
  name?: string;
  si?: string;
  gb?: string;
  categories: string[];
  aliases?: string[];
  /** Brand color when the sources don't carry one (e.g. a black wordmark). */
  hex?: string;
  /**
   * A logo sourced by hand into data/additions/<slug>/ (icon.svg + source.json):
   * official website or public-domain file, when no CC0 set has the brand.
   */
  addition?: boolean;
};

type AdditionSource = { origin: string; page: string; file: string; license: string; retrieved: string };

/** Manual fixes, applied after review of the contact sheet. */
type Overrides = Record<
  string,
  {
    /** Take the color icon from Simple Icons (gilbarbara's is outdated or wrong). */
    iconFrom?: "si";
    /** Derive mono from the color icon instead of Simple Icons' path. */
    monoFrom?: "derived";
    /** No mono at all (a derived one would lose overlapping detail). */
    skipMono?: boolean;
    /** Force the knockout mono on/off when the automatic badge detection is wrong. */
    monoKnockout?: boolean;
    noDark?: boolean;
    darkMode?: DarkMode;
    noWordmark?: boolean;
    reason?: string;
    /** A human checked the REVIEW flags on the contact sheet (date + what). */
    reviewed?: string;
  }
>;

type Source = { origin: string; file?: string; url: string; license: string };

export type LogoRecord = {
  slug: string;
  name: string;
  aliases: string[];
  categories: string[];
  hex: string | null;
  url: string | null;
  guidelines: string | null;
  variants: string[];
  sources: Record<string, Source>;
};

type ReportRow = { slug: string; variants: string[]; notes: string[] };

const WORDMARK_ASPECT = 1.4;

async function main() {
  const lock = await readJson<Lock>("sources.lock.json");
  await assertSimpleIconsVersion(lock.simpleIcons.version);
  const curation = (await readJson<{ logos: Curated[] }>("data/curation.json")).logos;
  const overrides = (await readJson<{ logos: Overrides }>("data/overrides.json")).logos;
  const categories = new Set(
    (await readJson<{ slug: string }[]>("data/categories.json")).map((c) => c.slug),
  );
  const gb = gilbarbara(lock.gilbarbara);
  // Badge icons measured by scripts/analyze.ts (absent on a first run).
  const backgrounds = await readJson<{ logos: Record<string, { color: string }> }>(
    "data/backgrounds.json",
  ).then((d) => d.logos, () => ({}) as Record<string, { color: string }>);

  const records: LogoRecord[] = [];
  const rows: ReportRow[] = [];
  const excluded: { slug: string; reason: string }[] = [];
  const files = new Map<string, string>(); // "slug/variant" -> svg

  for (const c of curation) {
    const notes: string[] = [];
    const fix = overrides[c.slug] ?? {};
    for (const cat of c.categories) {
      if (!categories.has(cat)) notes.push(`unknown category "${cat}"`);
    }

    // ── Upstream lookups ────────────────────────────────────────────────
    const si = c.si ? simpleIcon(c.si) : { skip: "no Simple Icons slug" };
    if (si.skip && c.si) notes.push(`Simple Icons skipped: ${si.skip}`);
    const gbEntry = c.gb ? await gb.entry(c.gb) : undefined;
    if (c.gb && !gbEntry) notes.push(`gilbarbara "${c.gb}" not found`);

    // Fetch + optimize + vet one gilbarbara file.
    async function gbFile(name: string) {
      const raw = await gb.file(name);
      const svg = optimizeSvg(raw, c.slug);
      const danger = securityIssues(svg);
      if (danger.length) {
        notes.push(`REJECTED ${name}: ${danger.join(", ")}`);
        return null;
      }
      notes.push(...qualityWarnings(svg).map((w) => `${name}: ${w}`));
      return svg;
    }

    // Files usually follow the shortname; a few don't (craftcms.svg for "craft").
    const gbFiles = gbEntry?.files ?? [];
    const gbIconName =
      gbFiles.find((f) => f === `${c.gb}-icon.svg`) ?? gbFiles.find((f) => f.endsWith("-icon.svg"));
    const gbMainName =
      gbFiles.find((f) => f === `${c.gb}.svg`) ??
      gbFiles.find((f) => !f.endsWith("-icon.svg") && !/-(alt|round)/.test(f));
    const gbIcon = gbIconName ? await gbFile(gbIconName) : null;
    const gbMain = gbMainName ? await gbFile(gbMainName) : null;
    const mainIsWordmark = gbMain ? viewBoxAspect(gbMain) > WORDMARK_ASPECT : false;

    const sources: Record<string, Source> = {};
    const gbSource = (file: string): Source => ({
      origin: "gilbarbara/logos",
      file,
      url: gb.fileUrl(file),
      license: lock.gilbarbara.license,
    });
    const siSource = (): Source => ({
      origin: "simple-icons",
      file: `${c.si}.svg`,
      url: si.icon!.source,
      license: lock.simpleIcons.license,
    });

    // ── icon (color) ────────────────────────────────────────────────────
    let icon: string | null = null;
    // Hand-sourced logos: same optimization and safety checks as the rest.
    let addition: { svg: string; source: AdditionSource } | null = null;
    if (c.addition) {
      const dir = path.join(ROOT, "data", "additions", c.slug);
      const source = JSON.parse(await readFile(path.join(dir, "source.json"), "utf-8")) as AdditionSource;
      const svg = optimizeSvg(await readFile(path.join(dir, "icon.svg"), "utf-8"), c.slug);
      const danger = securityIssues(svg);
      if (danger.length) notes.push(`REJECTED addition: ${danger.join(", ")}`);
      else addition = { svg, source };
    }
    let iconIsWide = false;
    if (addition) {
      icon = addition.svg;
      sources.icon = {
        origin: addition.source.origin,
        file: addition.source.file,
        url: addition.source.page,
        license: addition.source.license,
      };
      notes.push(`addition from ${addition.source.origin} (${addition.source.license}, ${addition.source.retrieved})`);
    } else if (fix.iconFrom === "si" && si.icon) {
      icon = optimizeSvg(svgFromPath(si.icon.path, `#${si.icon.hex}`), c.slug);
      sources.icon = siSource();
      notes.push(`icon from Simple Icons (override: ${fix.reason ?? "gilbarbara icon unusable"})`);
    } else if (gbIcon) {
      icon = gbIcon;
      sources.icon = gbSource(gbIconName!);
    } else if (gbMain && !mainIsWordmark) {
      icon = gbMain;
      sources.icon = gbSource(gbMainName!);
    } else if (si.icon) {
      icon = optimizeSvg(svgFromPath(si.icon.path, `#${si.icon.hex}`), c.slug);
      sources.icon = siSource();
      notes.push("color icon = Simple Icons path in brand hex (single color)");
    } else if (gbMain) {
      // The brand's only mark is wide (PHP oval, AWS smile): it IS the icon.
      icon = gbMain;
      iconIsWide = true;
      sources.icon = gbSource(gbMainName!);
      notes.push("icon is wide (the brand has no square mark)");
    }

    // ── mono ────────────────────────────────────────────────────────────
    let mono: string | null = null;
    if (!fix.skipMono) {
      if (si.icon && fix.monoFrom !== "derived") {
        mono = optimizeSvg(svgFromPath(si.icon.path, "currentColor"), c.slug);
        sources["icon-mono"] = siSource();
      } else if (icon && (fix.monoKnockout ?? Boolean(backgrounds[c.slug]))) {
        const bg = backgrounds[c.slug]?.color ?? dominantColor(icon) ?? "#000000";
        mono = makeMonoKnockout(icon, bg, `${c.slug}-mono-cut`);
        sources["icon-mono"] = { ...sources.icon, origin: `${sources.icon.origin} (derived, knockout)` };
        notes.push("mono = knockout of the badge (symbol cut out of its background)");
      } else if (icon) {
        mono = makeMonoFromColor(icon);
        sources["icon-mono"] = { ...sources.icon, origin: `${sources.icon.origin} (derived)` };
        notes.push("REVIEW mono derived from the color icon (check overlapping shapes)");
      }
    }

    // ── wordmark ────────────────────────────────────────────────────────
    const wordmark = !fix.noWordmark && !iconIsWide && gbMain && mainIsWordmark ? gbMain : null;
    if (wordmark) sources.wordmark = gbSource(gbMainName!);

    if (!icon && !mono) {
      excluded.push({ slug: c.slug, reason: notes.join("; ") || "no usable CC0 source" });
      continue;
    }

    // ── dark variants ───────────────────────────────────────────────────
    const variants: Record<string, string> = {};
    if (icon) variants.icon = standaloneColorSvg(icon);
    if (mono) variants["icon-mono"] = mono;
    if (wordmark) variants.wordmark = standaloneColorSvg(wordmark);
    // An all-light mark (lime, white) can't sit on the white page: darken it for
    // light mode and keep the brand original as the dark variant.
    const lightFixed = new Set<string>();
    for (const base of ["icon", "wordmark"] as const) {
      const svg = variants[base];
      if (svg && isAllLight(svg)) {
        variants[`${base}-dark`] = svg;
        sources[`${base}-dark`] = sources[base];
        variants[base] = makeLightVariant(svg);
        sources[base] = { ...sources[base], origin: `${sources[base].origin} (light: auto-darkened)` };
        lightFixed.add(base);
        notes.push(`${base} is all-light: darkened for light mode, original kept for dark`);
      }
    }
    if (!fix.noDark) {
      for (const base of ["icon", "wordmark"] as const) {
        if (lightFixed.has(base)) continue;
        const svg = variants[base];
        const dark = svg ? makeDarkVariant(svg, fix.darkMode) : null;
        if (dark) {
          variants[`${base}-dark`] = dark;
          sources[`${base}-dark`] = { ...sources[base], origin: `${sources[base].origin} (dark: auto)` };
        }
      }
    }

    for (const [variant, svg] of Object.entries(variants)) files.set(`${c.slug}/${variant}`, svg);

    records.push({
      slug: c.slug,
      // gilbarbara names can carry a gloss ("R (Language)"): keep the brand name only.
      name: c.name ?? si.icon?.title ?? gbEntry?.name.replace(/\s*\(.*\)\s*$/, "").trim() ?? c.slug,
      aliases: [...new Set([...(c.aliases ?? []), ...(si.icon?.aliases?.aka ?? [])])],
      categories: c.categories,
      hex: c.hex ?? (si.icon ? `#${si.icon.hex.toLowerCase()}` : icon ? dominantColor(icon) : null),
      url: gbEntry?.url ?? null,
      guidelines: si.icon?.guidelines ?? null,
      variants: Object.keys(variants),
      sources,
    });
    rows.push({
      slug: c.slug,
      variants: Object.keys(variants),
      notes: fix.reviewed
        ? notes.map((n) => n.replace(/^REVIEW /, "reviewed: ")).concat(`✓ ${fix.reviewed}`)
        : notes,
    });
  }

  // ── Write everything (full regeneration) ──────────────────────────────
  await rm(path.join(ROOT, "logos"), { recursive: true, force: true });
  for (const [key, svg] of files) {
    const file = path.join(ROOT, "logos", `${key}.svg`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, svg + "\n");
  }
  // Typed React components (the shadcn registry ships these files as-is).
  await rm(path.join(ROOT, "components"), { recursive: true, force: true });
  await mkdir(path.join(ROOT, "components"), { recursive: true });
  for (const record of records) {
    const variantFiles = Object.fromEntries(
      record.variants.map((v) => [v, files.get(`${record.slug}/${v}`)!]),
    );
    const icon = record.sources.icon;
    const code = await buildComponent({
      slug: record.slug,
      name: record.name,
      componentName: componentName(record.slug),
      files: variantFiles,
      credit: icon
        ? `${icon.origin
            .replace(/ \(.*\)$/, "")
            .replace("simple-icons", "Simple Icons")} (${icon.license})`
        : "Logoforge",
      siteUrl: SITE_URL,
    });
    await writeFile(path.join(ROOT, "components", `${record.slug}.tsx`), code);
  }

  records.sort((a, b) => a.slug.localeCompare(b.slug));
  await writeFile(
    path.join(ROOT, "data", "logos.json"),
    JSON.stringify(
      {
        $comment: "GENERATED by scripts/import.ts — edit data/curation.json or data/overrides.json instead.",
        sources: lock,
        count: records.length,
        logos: records,
      },
      null,
      2,
    ) + "\n",
  );

  // Contact sheets, 60 logos per page (a single page gets too tall to review).
  await rm(path.join(ROOT, "reports"), { recursive: true, force: true });
  await mkdir(path.join(ROOT, "reports"), { recursive: true });
  await writeFile(path.join(ROOT, "reports", "import-report.md"), report(rows, excluded, lock));
  const PAGE = 60;
  for (let i = 0; i * PAGE < records.length; i++) {
    const page = String(i + 1).padStart(2, "0");
    await writeFile(
      path.join(ROOT, "reports", `review-${page}.html`),
      reviewSheet(records.slice(i * PAGE, (i + 1) * PAGE), files),
    );
  }

  const review = rows.filter((r) => r.notes.some((n) => /REVIEW|REJECTED/.test(n))).length;
  console.log(
    `✓ ${records.length} logos · ${files.size} files · ${records.length} components · ${excluded.length} excluded · ${review} to review`,
  );
  console.log("  reports/import-report.md · reports/review-NN.html");
}

function report(rows: ReportRow[], excluded: { slug: string; reason: string }[], lock: Lock) {
  const count = (v: string) => rows.filter((r) => r.variants.includes(v)).length;
  const lines = [
    "# Import report",
    "",
    `Sources: simple-icons@${lock.simpleIcons.version} · gilbarbara/logos@${lock.gilbarbara.sha.slice(0, 7)} (CC0 only)`,
    "",
    `| Logos | icon | icon-mono | icon-dark | wordmark | wordmark-dark | Excluded |`,
    `|---|---|---|---|---|---|---|`,
    `| ${rows.length} | ${count("icon")} | ${count("icon-mono")} | ${count("icon-dark")} | ${count("wordmark")} | ${count("wordmark-dark")} | ${excluded.length} |`,
    "",
    "## Excluded",
    "",
    ...(excluded.length ? excluded.map((e) => `- **${e.slug}** — ${e.reason}`) : ["None."]),
    "",
    "## To review",
    "",
  ];
  const flagged = rows.filter((r) => r.notes.some((n) => /REVIEW|REJECTED/.test(n)));
  lines.push(
    ...(flagged.length
      ? flagged.map((r) => `- **${r.slug}** — ${r.notes.filter((n) => /REVIEW|REJECTED/.test(n)).join("; ")}`)
      : ["Nothing flagged."]),
    "",
    "## All logos",
    "",
    "| Logo | Variants | Notes |",
    "|---|---|---|",
    ...rows.map((r) => `| ${r.slug} | ${r.variants.join(", ")} | ${r.notes.join("; ")} |`),
    "",
  );
  return lines.join("\n");
}

/** Contact sheet: every variant on the light and the dark page background. */
function reviewSheet(records: LogoRecord[], files: Map<string, string>) {
  const tile = (bg: string, content: string, label: string) =>
    `<div class="t" style="background:${bg}"><div class="g">${content}</div><span>${label}</span></div>`;
  const img = (slug: string, v: string) =>
    files.has(`${slug}/${v}`) ? `<img src="../logos/${slug}/${v}.svg" alt="">` : `<em>—</em>`;
  const inline = (slug: string, v: string, color: string) =>
    files.has(`${slug}/${v}`)
      ? `<div style="color:${color};width:100%;height:100%">${files.get(`${slug}/${v}`)}</div>`
      : `<em>—</em>`;

  const rowsHtml = records
    .map((r) => {
      const darkIcon = r.variants.includes("icon-dark") ? "icon-dark" : "icon";
      const darkWord = r.variants.includes("wordmark-dark") ? "wordmark-dark" : "wordmark";
      return `<div class="r"><div class="n"><b>${r.name}</b><small>${r.slug}${
        r.variants.includes("icon-dark") ? " · dark auto" : ""
      }</small></div>
      ${tile("#fff", img(r.slug, "icon"), "icon")}
      ${tile("#0a0a0a", img(r.slug, darkIcon), darkIcon)}
      ${tile("#fff", inline(r.slug, "icon-mono", "#0a0a0a"), "mono")}
      ${tile("#0a0a0a", inline(r.slug, "icon-mono", "#fafafa"), "mono")}
      ${tile("#fff", img(r.slug, "wordmark"), "wordmark").replace('class="t"', 'class="t w"')}
      ${tile("#0a0a0a", img(r.slug, darkWord), darkWord).replace('class="t"', 'class="t w"')}</div>`;
    })
    .join("\n");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Logoforge — review sheet</title>
<style>
body{margin:0;font:13px system-ui,sans-serif;background:#e4e4e7;width:1400px}
.r{display:grid;grid-template-columns:170px repeat(4,110px) 250px 250px;gap:4px;padding:4px 8px;border-bottom:1px solid #d4d4d8}
.n{display:flex;flex-direction:column;justify-content:center}.n small{color:#71717a}
.t{position:relative;height:74px;display:flex;align-items:center;justify-content:center;border-radius:6px}
.g{width:38px;height:38px;display:flex;align-items:center;justify-content:center}.w .g{width:200px;height:34px}
.g img,.g svg{max-width:100%;max-height:100%;width:100%;height:100%}
.t span{position:absolute;bottom:3px;right:6px;font-size:10px;color:#a1a1aa}em{color:#a1a1aa}
</style></head><body>${rowsHtml}</body></html>`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
