# AGENTS.md

Canonical instructions for agents and humans in this repo. `CLAUDE.md` points
here.

prosodio is a Bun monorepo for managing, aligning, and playing audiobooks
alongside their ebooks on a synchronized timeline.

## Quality: run after every edit

Run `bun run ci` after every edit and before every commit — it lints,
format-checks, typechecks, and tests. If `ci` fails on formatting, run
`bun run fmt` to fix it, then re-run `ci`. Keep commits small and reviewable.

## Rules

- Public repo (MIT). Never commit real corpora, or reports that name them — they
  stay in gitignored `data/`.
- Configs are generated (`bun init`, `bun add`), never hand-written; versions
  come from the registry.
- Libs export raw `.ts` (no build step); `workspace:*` for internal deps.

## Layout

- `packages/` libs · `components/` React UI · `apps/` runnables
- `docs/` reference · `thoughts/` plans, research, tickets, reviews
- `fixtures/` public test data · `data/` gitignored private corpora

## Docs

- [docs/FORMATTING.md](docs/FORMATTING.md) — formatting + lint mechanics, with a
  reproducible proof section.
- [docs/MARKDOWN.md](docs/MARKDOWN.md) — markdown authoring style.
- [docs/CODING-STYLE.md](docs/CODING-STYLE.md) — code conventions (top-down
  ordering).
