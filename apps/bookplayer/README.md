# @prosodio/bookplayer

Local-first web app: browse the audiobook library, read the EPUB while
listening, follow the VTT transcript. Design and decision record (worked
exemplar, kept while backlog items reference it):
[thoughts/plans/archive/bookplayer.md](../../thoughts/plans/archive/bookplayer.md).

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
- Volatile state: `data/bookplayer/{cache,evidence}` (gitignored)

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
