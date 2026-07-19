# docs

For dev and LLM alike: brevity, accuracy, nothing extra. One fact, one home.
Flat files in three groups; this index is the taxonomy (BACKLOG `docs-taxonomy`
tracks the pending pipeline docs).

## Working here

How to work in this repo — layout, workflow, tooling, style.

- [file-layout.md](file-layout.md) — where things live
- [privacy.md](privacy.md) — public/private data boundary
- [workflow.md](workflow.md) — backlog/ticket/plan formats, how work flows
- [workspace.md](workspace.md) — quality gate, testing gotchas, seeding
- [dependency.md](dependency.md) — adding, workspace imports, catalogs, updates
- [formatting.md](formatting.md) — formatting + linting
- [markdown.md](markdown.md) — markdown authoring style
- [coding-style.md](coding-style.md) — top-down + reconciliation conventions
- [styling.md](styling.md) — theming + Tailwind

## Pipeline & data

What the system does and what must hold about the data — algorithms, contracts,
invariants. Grows by harvesting settled `thoughts/design/` docs.

- [locate-sweep.md](locate-sweep.md) — what the locate sweep verifies; what an
  `ok` means
- [corpora/metadata.md](corpora/metadata.md) — where title/author come from (m4b
  tags are canonical; basename is a fallback)

## Frameworks

- [framework-tanstack.md](framework-tanstack.md) — TanStack Start bootstrap +
  media-serving pattern (validated in apps/bookplayer)
- [framework-astro.md](framework-astro.md) — Astro/Starlight bootstrap
  (unvalidated)

## Applications

- [bookplayer/](bookplayer/) — Bookplayer architecture and operating contracts
