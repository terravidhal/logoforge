import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import * as simpleIcons from "simple-icons";
import type { SimpleIcon } from "simple-icons";

/**
 * Upstream access, pinned by sources.lock.json. Simple Icons comes from the
 * npm package; gilbarbara/logos files are fetched at the locked commit and
 * cached in .cache/ so re-runs are offline and deterministic.
 */

export const ROOT = path.resolve(import.meta.dirname, "..", "..");

export type Lock = {
  simpleIcons: { version: string; license: string };
  gilbarbara: { repo: string; sha: string; license: string };
};

export async function readJson<T>(rel: string): Promise<T> {
  return JSON.parse(await readFile(path.join(ROOT, rel), "utf-8")) as T;
}

// ── Simple Icons ────────────────────────────────────────────────────────────

type SiMeta = {
  slug: string;
  title: string;
  hex: string;
  source: string;
  guidelines?: string;
  license?: { type: string };
  aliases?: { aka?: string[] };
};

const require = createRequire(import.meta.url);
const siMeta = require("simple-icons/icons.json") as SiMeta[];
const siMetaBySlug = new Map(siMeta.map((m) => [m.slug, m]));
const siIconBySlug = new Map(
  (Object.values(simpleIcons) as SimpleIcon[])
    .filter((icon) => icon?.slug)
    .map((icon) => [icon.slug, icon]),
);

export type SiEntry = SiMeta & { path: string };

/** A Simple Icons entry, or the reason it can't be used. */
export function simpleIcon(slug: string): { icon?: SiEntry; skip?: string } {
  const meta = siMetaBySlug.get(slug);
  const icon = siIconBySlug.get(slug);
  if (!meta || !icon) return { skip: "not in Simple Icons" };
  // An icon carrying its own license (CC-BY, GPL, NC…) is not CC0.
  if (meta.license && meta.license.type !== "CC0-1.0") {
    return { skip: `Simple Icons licence is ${meta.license.type}, not CC0` };
  }
  return { icon: { ...meta, path: icon.path } };
}

export async function assertSimpleIconsVersion(expected: string) {
  // package.json isn't exported: locate it next to the resolved entry point.
  const dir = path.dirname(require.resolve("simple-icons"));
  const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf-8")) as {
    version: string;
  };
  if (pkg.version !== expected) {
    throw new Error(`simple-icons ${pkg.version} installed, lock expects ${expected}`);
  }
}

// ── gilbarbara/logos ────────────────────────────────────────────────────────

export type GbEntry = { name: string; shortname: string; url: string; files: string[] };

async function cached(url: string, file: string) {
  try {
    return await readFile(file, "utf-8");
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const text = await res.text();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
    return text;
  }
}

export function gilbarbara(lock: Lock["gilbarbara"]) {
  const base = `https://raw.githubusercontent.com/${lock.repo}/${lock.sha}`;
  const cacheDir = path.join(ROOT, ".cache", "gilbarbara", lock.sha);
  let index: Map<string, GbEntry> | null = null;

  return {
    async entry(shortname: string) {
      if (!index) {
        const list = JSON.parse(
          await cached(`${base}/logos.json`, path.join(cacheDir, "logos.json")),
        ) as GbEntry[];
        index = new Map(list.map((e) => [e.shortname, e]));
      }
      return index.get(shortname);
    },
    file(name: string) {
      return cached(`${base}/logos/${name}`, path.join(cacheDir, "logos", name));
    },
    fileUrl(name: string) {
      return `https://github.com/${lock.repo}/blob/${lock.sha}/logos/${name}`;
    },
  };
}
