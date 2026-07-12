# EPUB Validate

A parser-agnostic EPUB validation harness: it opens every book in the `test`,
`space`, and `drop` corpora with three independent parsers, captures a
Zod-validated `ParserOutput` (metadata, spine, manifest, per-item content
SHA-256, TOC tree), and produces a deterministic pairwise comparison report.

**Read first:**
[`FINDINGS-epub-validate-2026-06-24.md`](docs/findings-epub-validate-2026-06-24.md)
— consolidated findings and the problematic-books inventory (books to fix rather
than code). Unscheduled work lives in the root
[`thoughts/BACKLOG.md`](../../thoughts/BACKLOG.md).

## Operations

```bash
bun install             # deps + Chromium (via postinstall)
bun run validate        # full corpus run: build browser bundle, then validate
bun run build:browser   # rebuild the browser bundle only (see Setup)
```

Quality gate: root `bun run ci` (from the repo root) covers this app's format,
lint, typecheck, and tests — there are no app-local check scripts.

`bun run validate` processes every configured root and parser path and replaces
the current reports only after successful completion — preserving the nested
local-only `reports/.git` (see the root `docs/privacy.md`). The corpus roots are
defined in [`src/config.ts`](src/config.ts) (`test` → `fixtures/epub/`, `space`
→ a mounted volume, `drop` → a Dropbox path).

## Setup

`bun install` is all that is required; the `postinstall` hook installs the
Chromium build Playwright needs. Dependencies are managed with Bun — add with
`bun add <pkg>` / `bun add -d <pkg>`.

### Browser bundle (`build:browser`)

The `epubts-browser` parser path must exercise epub.ts against a **real browser
DOM**, not the Node/LinkeDOM path. The inspector launches Chromium (via
Playwright) and injects a script into the page. `build:browser` produces that
script:

```bash
bun build src/browser/entry.ts --target=browser --format=iife \
  --outfile=dist/epubts-browser.js
```

It bundles `src/browser/entry.ts` — which imports `@likecoin/epub-ts` (the
browser build), never `@likecoin/epub-ts/node` — into a single self-contained
IIFE. The bundle exposes one narrow function,
`globalThis.epubInspect.transport`, that the host calls inside the page. The
output `dist/epubts-browser.js` is generated (git-ignored) and rebuilt on every
`validate` run, so it never goes stale. Before launching, `verifyBrowserBundle`
asserts the bundle contains no LinkeDOM and no `node:` imports — the guarantee
that this path is genuinely browser-side.

## Context

The end goal is a **global EPUB parsing approach** for downstream audiobook
alignment work. That parser must run in **Node/Bun only** — invoking a browser
at runtime is not acceptable for the real pipeline.

The three-way comparison is really **two pairs with different purposes**:

- **epub.ts browser vs epub.ts node** — the browser path is used _only_ to
  bypass LinkeDOM and serve as a trusted reference, confirming our Node/Bun-only
  parsing is equivalent. It is a verification tool, not part of the target
  pipeline. (It has already earned its keep — it caught the node-path metadata
  entity-truncation bug and the Thud! TOC failure; see
  `docs/findings-epub-validate-2026-06-24.md`.)

- **epub.ts node vs storyteller (@storyteller-platform/epub)** — Storyteller has
  a full alignment solution we may want to interoperate with. The goal is to
  validate whether the two are interchangeable, and if not, why not. Storyteller
  is constrained (by default) to EPUB 3, though its EPUB 2-to-3 up-conversion
  facility may give some leeway.

### Documents

`docs/` holds the retained findings:
[`FINDINGS-epub-validate-2026-06-24.md`](docs/findings-epub-validate-2026-06-24.md)
(consolidated findings + problematic-books inventory, maintained as the corpus
evolves). Historical plans were pruned at port time; work tracking follows the
root `docs/workflow.md` using `thoughts/BACKLOG.md` and `thoughts/plans/`.
