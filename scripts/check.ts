/**
 * Logoforge check — validates the generated set before it ships (run in CI).
 *
 *   npm run logos:check            (from the site root)
 *
 * Fails on: unknown category, bad slug, a declared variant without its file,
 * an SVG file no logo declares, any SVG that could execute or load remote
 * content, a missing viewBox, or a source that isn't CC0 / an approved addition.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { LogoRecord } from "./import";
import { readJson, ROOT } from "./lib/sources";
import { securityIssues } from "./lib/svg";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// CC0 sets, public-domain files, and hand-sourced official artwork (trademark).
const ALLOWED_LICENSES = new Set(["CC0-1.0", "public-domain", "trademark"]);

async function main() {
  const { logos } = await readJson<{ logos: LogoRecord[] }>("data/logos.json");
  const categories = new Set(
    (await readJson<{ slug: string }[]>("data/categories.json")).map((c) => c.slug),
  );
  const errors: string[] = [];
  const declared = new Set<string>();

  for (const logo of logos) {
    if (!SLUG.test(logo.slug)) errors.push(`${logo.slug}: slug must be kebab-case`);
    if (logo.categories.length === 0) errors.push(`${logo.slug}: no category`);
    for (const c of logo.categories) {
      if (!categories.has(c)) errors.push(`${logo.slug}: unknown category "${c}"`);
    }
    if (!logo.variants.includes("icon") && !logo.variants.includes("icon-mono")) {
      errors.push(`${logo.slug}: needs at least an icon or a mono`);
    }
    for (const variant of logo.variants) {
      const rel = `${logo.slug}/${variant}.svg`;
      declared.add(rel);
      const source = logo.sources[variant];
      if (!source) errors.push(`${rel}: no source recorded`);
      else if (!ALLOWED_LICENSES.has(source.license)) {
        errors.push(`${rel}: licence ${source.license} is not allowed`);
      }
      let svg: string;
      try {
        svg = await readFile(path.join(ROOT, "logos", rel), "utf-8");
      } catch {
        errors.push(`${rel}: declared but missing`);
        continue;
      }
      const danger = securityIssues(svg);
      if (danger.length) errors.push(`${rel}: ${danger.join(", ")}`);
      if (!/viewBox=/.test(svg)) errors.push(`${rel}: no viewBox`);
      if (/<svg[^>]*\s(width|height)=/.test(svg)) errors.push(`${rel}: fixed width/height`);
    }
  }

  // Orphans: files on disk that no logo declares.
  for (const dir of await readdir(path.join(ROOT, "logos"))) {
    for (const file of await readdir(path.join(ROOT, "logos", dir))) {
      if (!declared.has(`${dir}/${file}`)) errors.push(`${dir}/${file}: not declared in logos.json`);
    }
  }

  if (errors.length) {
    console.error(`✗ ${errors.length} problem(s):\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`✓ ${logos.length} logos, ${declared.size} files — all checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
