<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/mark-dark.svg">
  <img src=".github/assets/mark-light.svg" alt="Logoforge" width="56" height="56">
</picture>

# Logoforge

**Brand logos for developers, as shadcn components.**

971 clean SVG logos of the tools developers use — install any of them as a typed React component<br>
with one command, copy the SVG, or build a whole “Trusted by” logo cloud in seconds.

```bash
npx shadcn@latest add @logoforge/stripe
```

[**Website**](https://logoforge.terravidhal.me) · [Logo cloud builder](https://logoforge.terravidhal.me/cloud) · [Categories](https://logoforge.terravidhal.me/categories) · [Docs](https://logoforge.terravidhal.me/docs) · [Request a logo](../../issues/new)

[![shadcn registry](https://img.shields.io/badge/shadcn-official%20directory-black)](https://ui.shadcn.com/docs/directory)
[![Logos: 971](https://img.shields.io/badge/logos-971-black)](https://logoforge.terravidhal.me)
[![Sources: CC0](https://img.shields.io/badge/sources-CC0-black)](CREDITS.md)
[![Tooling: MIT](https://img.shields.io/badge/tooling-MIT-black)](LICENSE)
[![check](https://github.com/terravidhal/logoforge/actions/workflows/check.yml/badge.svg)](https://github.com/terravidhal/logoforge/actions/workflows/check.yml)
[![Logoforge MCP server](https://glama.ai/mcp/connectors/me.terravidhal.logoforge/logoforge/badges/score.svg)](https://glama.ai/mcp/connectors/me.terravidhal.logoforge/logoforge)

<a href="https://logoforge.terravidhal.me"><img src=".github/assets/hero.png" alt="Logoforge — every logo your stack ships with" width="900"></a>

</div>

> ⭐ **If Logoforge saves you a logo hunt, a star helps other developers find it.**

---

## Why Logoforge

- **One command, one typed component.** `npx shadcn add @logoforge/stripe` writes `components/logos/stripe.tsx` — no package to install, no CSS touched, nothing but React. `<StripeLogo />`, `<GithubLogo variant="mono" />`, `<VercelLogo type="wordmark" />`: TypeScript only offers the variants a logo really has.
- **Dark mode that works.** Near-black marks (GitHub, Vercel, Notion…) ship a dark file; the component switches with your `.dark` class — Tailwind v3 and v4, no JavaScript.
- **Mono that keeps its detail.** Badge-style marks (Adobe apps, AWS services) get a *knockout* one-color version — the symbol cut out of its shape — not a solid blob.
- **Logo clouds in one command.** Pick logos on [/cloud](https://logoforge.terravidhal.me/cloud), choose grid, marquee or bento; one `shadcn add` installs the section and every logo it imports.
- **African brands.** MTN, Orange Money, M-Pesa, Flutterwave, Paystack, Moniepoint, OPay, Kuda, Chipper Cash, Yoco, Interswitch, Airtel, Orange, Andela — the brands most logo sets leave out.
- **Built for AI editors.** An MCP server lets Claude, Cursor, Windsurf or VS Code search and add logos for you.
- **Every file is traceable.** Each variant records its source, its exact upstream file and its licence.

<div align="center">
  <img src=".github/assets/logo-cloud-builder.gif" alt="The logo cloud builder: add logos, switch layout and colors, copy one install command" width="800">
  <br><sub>The <a href="https://logoforge.terravidhal.me/cloud">logo cloud builder</a> — pick logos, switch grid · marquee · bento, install with one command.</sub>
</div>

<div align="center">
  <br>
  <a href="https://logoforge.terravidhal.me"><img src=".github/assets/gallery.png" alt="The gallery: 971 logos, 27 categories, color or mono" width="900"></a>
  <br><sub>The gallery — 971 logos in 27 categories (AI, frameworks, databases, cloud, payments, learning, African brands…), color or mono.</sub>
</div>

## Use it

### shadcn CLI

`@logoforge` is in the [official shadcn registry directory](https://ui.shadcn.com/docs/directory) — no setup needed. Install any logo (slug = the logo page URL):

```bash
npx shadcn@latest add @logoforge/stripe @logoforge/supabase
```

<details>
<summary>Older shadcn CLI? Declare the namespace once in <code>components.json</code></summary>

```json
{
  "registries": {
    "@logoforge": "https://logoforge.terravidhal.me/r/{name}.json"
  }
}
```

</details>

```tsx
import { StripeLogo } from "@/components/logos/stripe";

<StripeLogo className="size-8" />                 // brand colors, auto dark mode
<StripeLogo variant="mono" className="size-6" />  // currentColor
<StripeLogo type="wordmark" className="h-6 w-auto" />
<StripeLogo mode="dark" />                        // force a theme (no Tailwind needed)
<StripeLogo title="" />                           // decorative: aria-hidden
```

### SVG files

Every variant is a plain file: `https://logoforge.terravidhal.me/logos/<slug>/<variant>.svg`

| Variant | What it is | When |
|---|---|---|
| `icon` | The mark, brand colors | always |
| `icon-mono` | One color, `currentColor` | most logos |
| `icon-dark` | For dark backgrounds | when the mark would vanish on dark |
| `wordmark` / `wordmark-dark` | The full lockup | when the brand has one |

Or grab them straight from this repository: [`logos/`](logos).

### MCP server (Claude, Cursor, Windsurf, VS Code)

```bash
claude mcp add --transport http logoforge https://logoforge.terravidhal.me/mcp
```

Tools: `search_logos`, `list_categories`, `get_logo`, `get_logo_svg`, `get_logo_component`, `build_logo_cloud`.
Setup for every editor: [docs/mcp](https://logoforge.terravidhal.me/docs/mcp).

### JSON API

```bash
curl https://logoforge.terravidhal.me/api/logos.json          # every logo
curl https://logoforge.terravidhal.me/api/logos/stripe.json   # one logo, with sources
```

Static, no key, CORS open. Or read [`data/logos.json`](data/logos.json) directly.

## What's in this repository

```
logos/<slug>/*.svg         optimized SVG files, one folder per logo
components/<slug>.tsx      the generated React component (what the registry installs)
data/logos.json            GENERATED manifest: names, aliases, categories, colors, variants, sources
data/curation.json         which logos ship and where each comes from   ← edit this
data/overrides.json        reviewed fixes, each with its reason          ← and this
data/additions/<slug>/     hand-sourced artwork + source.json (official or public domain)
data/backgrounds.json      GENERATED badge detection for knockout monos
scripts/                   the pipeline: import · analyze · check
reports/                   import report + contact sheets for visual review
```

## How the set is built

1. **Sources, pinned** — [`sources.lock.json`](sources.lock.json) fixes the Simple Icons version and the gilbarbara/logos commit.
2. **Licence filter** — CC0 only from the sets: Simple Icons icons published under another licence (CC BY, GPL, MIT…) are dropped. Brands no free set covers are added by hand in `data/additions/`, public-domain files first, the brand's own artwork otherwise — each with its `source.json`.
3. **Optimize & vet** — SVGO (viewBox kept, no fixed size, ids prefixed by slug); any script, event handler, embedded image or external reference is rejected.
4. **Variants** — dark files are derived automatically (black ↔ white swap for knockout marks, near-black text to white, dark brand colors lightened to a 3:1 contrast, masks left untouched); monos come from Simple Icons, or are derived — as knockouts for badge marks detected in headless Chrome.
5. **Components** — SVGR turns each variant into JSX; ids are suffixed per variant so several can share a page.
6. **Human review** — every run writes contact sheets (`reports/review-NN.html`); anything flagged must be looked at before it ships, and the decision is recorded in `data/overrides.json`.

```bash
npm install
npm run import     # build logos/, components/, data/logos.json, reports/
npm run analyze    # detect badge icons (needs Chrome; CHROME_PATH to override), then import again
npm run check      # validate everything — runs in CI on every pull request
```

## Contributing

**Request a logo** — [open an issue](../../issues/new) with the brand name and a link to its official brand assets.

**Add a logo** from a free set:

1. Add an entry to `data/curation.json`: `{ "slug": "acme", "si": "<simple-icons slug>", "gb": "<gilbarbara shortname>", "categories": ["devtools"] }`.
2. `npm run import && npm run analyze && npm run import`, then open the contact sheet in `reports/` and look at your logo on light and dark, in color and mono.
3. Fix anything off in `data/overrides.json` with a `reason`, run `npm run check`, open a pull request.

**Add a logo no free set has**: create `data/additions/<slug>/icon.svg` from a public-domain file or the brand's own website, plus a `source.json` (`origin`, `page`, `file`, `license`: `public-domain` or `trademark`, `retrieved`), and add `"addition": true` to its curation entry. Never trace a PNG: if no vector exists, the logo waits.

Categories are listed in [`data/categories.json`](data/categories.json).

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licences and trademarks

- **Tooling and data** (scripts, components template, manifest): [MIT](LICENSE).
- **Artwork**: from [Simple Icons](https://github.com/simple-icons/simple-icons) (CC0 1.0), [gilbarbara/logos](https://github.com/gilbarbara/logos) (CC0 1.0), Wikimedia Commons public-domain files, and — for a few brands no free set covers — the brands' own artwork. See [CREDITS.md](CREDITS.md); every file's source is in `data/logos.json`.
- **Trademarks**: all product names, logos and brands are property of their respective owners. They are provided for identification only and their presence does not imply endorsement. A free licence on a *file* grants nothing on the *brand*: use a logo to refer to its product, and follow the brand's guidelines.

**Brand owners**: to remove or correct a logo, write from your company's domain to the address on [logoforge.terravidhal.me/legal](https://logoforge.terravidhal.me/legal#removal) — handled within 72 hours.

---

<div align="center">

**Logoforge is free and open source.** If it helped you, [⭐ star the repo](https://github.com/terravidhal/logoforge) — it's the best way to help other developers find it.

Built by [Vidhal Elame](https://github.com/terravidhal) · sibling of [Blockforge](https://blockforge.terravidhal.me)

</div>
