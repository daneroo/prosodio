# @prosodio/bookplayer

Local-first web app: browse the audiobook library, read the EPUB while
listening, follow the VTT transcript. Plan:
[thoughts/plans/bookplayer.md](../../thoughts/plans/bookplayer.md).

## Operations

- `bun run dev` — dev server on port 3000 (run from this directory)
- `bun run build` then `bun run start` — production build + serve
- Quality gates are root-level: `bun run ci` from the repo root

## Setup

- `cp .env.example .env` and adjust; `BOOKPLAYER_ROOT=fixtures|private` selects
  the active library root (default `fixtures`).
- Fixtures flow needs `bun scripts/fetch-and-check-fixtures.ts` (repo root).

## Context

TanStack Start + Nitro (bun preset) + React, scaffolded with `@tanstack/cli`;
see the plan for architecture and decisions.
