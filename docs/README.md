# docs

For dev and LLM alike: brevity, accuracy, nothing extra. One fact, one home.
Flat files in three groups; this index is the taxonomy (BACKLOG `docs-taxonomy`
tracks the pending pipeline docs).

## Working here

How to work in this repo — layout, workflow, tooling, style.

- [FILE-LAYOUT.md](FILE-LAYOUT.md) — where things live
- [PRIVACY.md](PRIVACY.md) — public/private data boundary
- [WORKFLOW.md](WORKFLOW.md) — backlog/ticket/plan formats, how work flows
- [WORKSPACE.md](WORKSPACE.md) — quality gate, testing gotchas, seeding
- [DEPENDENCY.md](DEPENDENCY.md) — adding, workspace imports, catalogs, updates
- [FORMATTING.md](FORMATTING.md) — formatting + linting
- [MARKDOWN.md](MARKDOWN.md) — markdown authoring style
- [CODING-STYLE.md](CODING-STYLE.md) — top-down + reconciliation conventions
- [STYLING.md](STYLING.md) — theming + Tailwind

## Pipeline & data

What the system does and what must hold about the data — algorithms, contracts,
invariants. Grows by harvesting settled `thoughts/design/` docs.

- [LOCATE-SWEEP.md](LOCATE-SWEEP.md) — what the locate sweep verifies; what an
  `ok` means

## Frameworks

- [FRAMEWORK-TANSTACK.md](FRAMEWORK-TANSTACK.md) — TanStack Start bootstrap +
  media-serving pattern (validated in apps/bookplayer)
- [FRAMEWORK-ASTRO.md](FRAMEWORK-ASTRO.md) — Astro/Starlight bootstrap
  (unvalidated)
