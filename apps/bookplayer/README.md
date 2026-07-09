# @prosodio/bookplayer

Local-first web app: browse the audiobook library, read the EPUB while
listening, follow the VTT transcript, and inspect the narration<->book alignment
(word-level match runs via `@prosodio/align`, with the reader following
playback). Design and decision records (worked exemplars, kept while backlog
items reference them):
[thoughts/plans/archive/bookplayer.md](../../thoughts/plans/archive/bookplayer.md)
and
[thoughts/plans/bookplayer-align.md](../../thoughts/plans/bookplayer-align.md).

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
- Dev-only `/dev/locate/:bookId` (`src/routes/dev.locate.$bookId.tsx`) sweeps
  every matched EPUB token through the real epub.js: DOM path resolve -> text
  guard -> `cfiFromRange` -> `EpubCFI` round-trip. Reports totals + per-section
  detail in the UI and via `window.__locateSweepReport`; never runs outside
  `import.meta.env.DEV`.
