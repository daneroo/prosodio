# doc-harvest — Harvest ai-garden docs into prosodio/docs

Goal: a terse, durable `docs/` set, harvested and refactored from scattered
ai-garden markdown.

- [x] Inventory + triage candidate `*.md` (bun-one, experiments). Signal small —
      most of 84 files are placeholders/meta/per-experiment noise.
- [x] Build the `docs/` set: FILE-LAYOUT, WORKSPACE (absorbs SEEDING),
      DEPENDENCY, STYLING, FRAMEWORK-TANSTACK, FRAMEWORK-ASTRO; keep
      FORMATTING/MARKDOWN/ CODING-STYLE.
- [x] Refactor to terse rule-sheets: importance-first, no package.json
      restatement, one-concept-one-home, bullets over tables.
- [x] Mark FRAMEWORK-\* unvalidated; strip provenance comments.
- [x] Add `docs/README.md` index (dev+LLM brevity intro).
- [x] Define the `thoughts/` lifecycle -> `docs/WORKFLOW.md` (closed the only
      open question).
