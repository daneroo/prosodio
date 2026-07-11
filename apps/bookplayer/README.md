# @prosodio/bookplayer

Local-first web app: browse the audiobook library, read the EPUB while
listening, follow the VTT transcript, and inspect the narration<->book alignment
(word-level match runs via `@prosodio/align`, with the reader following
playback). Design and decision records (worked exemplars, kept while backlog
items reference them):
[thoughts/plans/archive/bookplayer.md](../../thoughts/plans/archive/bookplayer.md)
and
[thoughts/plans/bookplayer-align.md](../../thoughts/plans/archive/bookplayer-align.md).

## TODO

- Surface scan warnings beyond a count (v1 shows count; details in server logs)
- Fold `src/lib/config.ts` into `packages/config` when `promote-app-config`
  lands
- Metadata policy changes do not invalidate the cache (fingerprint-gated reuse);
  delete `data/bookplayer/cache/` to force re-enrichment

## Operations

- `bun run dev` — dev server on port 3000 (run from this directory)
- `bun run build` then `bun run start` — production build + serve
- Quality gates are root-level: `bun run ci` from the repo root
- Volatile state: `data/bookplayer/{cache,evidence}` (gitignored); `cache/`
  holds the metadata index (`index.json`) and per-book alignment artifacts
  (`<bookId>.alignment.{json,json.gz,key.json}`) keyed by schema version +
  source mtimes — delete a file to force recompute

## Setup

- `cp .env.example .env`; `BOOKPLAYER_ROOT=fixtures|private` selects the active
  library root (default `fixtures`; exactly one root per run). Private-root dirs
  can be overridden with `AUDIOBOOKS_ROOT` / `VTT_DIR`.
- The fixtures flow needs `bun scripts/fetch-and-check-fixtures.ts` (repo root)
  once, to fetch the gitignored Alice m4b.

## Context

- TanStack Start + React + Tailwind on Nitro (bun preset), scaffolded with
  `@tanstack/cli`.
- Asset endpoints (`/api/{audio,cover,epub,vtt}/$bookId`) are nitro handlers
  (`server/handlers/`), not TanStack server routes: nitro's dev middleware only
  dispatches media-element requests (`Sec-Fetch-Dest` image/audio) to routes in
  its own routing table.
- Canonical record: one `.m4b` + `cover.jpg|png` per directory; `.epub` and a
  basename-matched `.vtt` (from the transcriptions dir) are capabilities.
- Progress (audio position, EPUB CFI, filters) lives in `localStorage`.
- `GET /api/alignment/:bookId` (`server/handlers/alignment.ts`) serves the
  versioned `AlignmentArtifact` (`@prosodio/align`) as pure bytes: `ETag`
  (`W/"a<schemaVersion>-<vttMtimeMs>-<epubMtimeMs>"`), `If-None-Match` -> 304,
  gzip variant when `Accept-Encoding` allows, `Cache-Control: no-cache`. First
  call for a book computes and caches the artifact — can take minutes on large
  private books, same UX as before. The client derives everything else
  (`@prosodio/align/browser`: token times, epubSeq, cue aggregates, locator
  lookup) — no server-side join.
- Alignment cache:
  `data/bookplayer/cache/<bookId>.alignment.{json,json.gz,key.json}`.
  `.key.json` is the staleness sidecar (`schemaVersion`, `vttMtimeMs`,
  `epubMtimeMs` only — no filesystem paths; the artifact is a browser-served
  asset).
- EPUB locate (`EpubReader.tsx`) validates whole-section parity
  (`checkSectionParity`, `@prosodio/align/browser`) once per section href before
  trusting any token locate in it; a parity failure warns once per section (not
  once per token) and the section is marked unlocatable.
- Extraction parse mode is extension-driven, mirroring epub.js
  (`parserPreferenceForHref`, `packages/align/src/epub-extract.ts`; design
  D10/H1): `.xhtml`/`.xht` -> XML-first; `.html`/`.htm` -> straight HTML parse,
  even when the content is well-formed XHTML (matching the browser matters more
  than parser purity). `ParseMode` = `xhtml | html | html-fallback` —
  `html-fallback` is malformed content forced through the lenient HTML parser:
  predicted-unlocatable, since epub.js hits the same malformed markup and gets a
  parsererror tree.
- Dev-only `/lab/locate/:bookId` (`src/routes/lab.locate.$bookId.tsx`) sweeps
  every matched EPUB token through the real epub.js: DOM path resolve -> text
  guard -> `cfiFromRange` -> `EpubCFI` round-trip. Reports totals + per-section
  detail (incl. `parseMode` vs extension-predicted mode) in the UI and via
  `window.__locateSweepReport`; auto-persists its report on completion; never
  runs outside `import.meta.env.DEV`. Player top bar carries a dev-only "lab"
  link to it.
- `/lab/locate` (`src/routes/lab.locate.index.tsx`) runs the same sweep across
  every book with both EPUB and transcript, sequentially one book at a time;
  "Run all"/"Run missing" plus a per-row "Run", live per-book progress, and a
  totals footer (clean/partial/zero-ok, token sums). Sweep reports persist
  server-side via `GET/PUT /api/locate-sweep/:bookId`
  (`server/handlers/locate-sweep.ts`, `src/lib/locate-sweep-store.ts`) as
  `data/bookplayer/cache/<bookId>.locate-sweep.json`; `GET /api/locate-sweep`
  returns the totals-only index for the corpus table.
