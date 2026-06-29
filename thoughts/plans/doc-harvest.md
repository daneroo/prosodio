# Doc harvest inventory

Triage of ai-garden `*.md` into prosodio `docs/`. Goal: durable, always-valid
reference; concise; each fact in one intuitive place. Verdicts are grounded in
having read the sources, not guessed.

These docs capture framework/tool specifics **as we use them under bun** (our
practices) — not a rewrite of upstream framework docs. Preserve harvested
instructions; relocate, don't reword.

Workflow: import keepers as-is with a provenance pointer
(`Ported from ai-garden@<sha>:<path>`), commit; reformat (prettier) in a
SEPARATE commit; then refactor/rename. Reconcile overlaps last.

## Target `docs/` set

| file                    | purpose                                                                                        | status / sources                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `README.md`             | index of `docs/` (what covers what)                                                            | NEW — built from this table                                               |
| `FILE-LAYOUT.md`        | dir tree + what goes where                                                                     | NEW — extract from current `AGENTS.md` Layout; AGENTS keeps a pointer     |
| `WORKSPACE.md`          | all script targets, `ci`/`fmt` gate, CI, exceptions; last section `## Seeding this repository` | merge `bun-one/docs/WORKSPACE-BUN.md` + current `docs/SEEDING.md`         |
| `DEPENDENCY.md`         | adding deps, `workspace:*`, `--filter`, catalogs, outdated/update, dependabot                  | from WORKSPACE-BUN.md dep sections                                        |
| `FORMATTING.md`         | formatting + linting (with proof)                                                              | EXISTS — keep                                                             |
| `MARKDOWN.md`           | markdown authoring style                                                                       | EXISTS — keep (experiments/MARKDOWN already covered, no merge)            |
| `CODING-STYLE.md`       | code conventions (top-down)                                                                    | EXISTS — keep                                                             |
| `STYLING.md`            | theming + Tailwind `@source`/components rule                                                   | `experiments/STYLING.md` + Tailwind bits of WORKSPACE-BUN.md              |
| `FRAMEWORK-TANSTACK.md` | TanStack Start bootstrap (bun specifics)                                                       | merge `experiments/BUN_TANSTACK.md` + tan-one section of WORKSPACE-BUN.md |
| `FRAMEWORK-ASTRO.md`    | Astro/Starlight bootstrap (bun specifics)                                                      | Astro Starlight section of WORKSPACE-BUN.md                               |

FRAMEWORK-* scope: bootstrap/seeding only. Deeper runtime notes get added back
when we recreate the experiments (bookfinder/bookplayer) as ports into prosodio.

`SEEDING.md` is folded into `WORKSPACE.md` and then deleted.

## Source verdicts

### Keep / merge (real durable content)

| source                          | -> destination                                                     |
| ------------------------------- | ------------------------------------------------------------------ |
| `bun-one/docs/WORKSPACE-BUN.md` | WORKSPACE.md + DEPENDENCY.md + FRAMEWORK-* + STYLING.md (Tailwind) |
| `experiments/STYLING.md`        | STYLING.md                                                         |
| `experiments/BUN_TANSTACK.md`   | FRAMEWORK-TANSTACK.md                                              |
| current `docs/SEEDING.md`       | WORKSPACE.md `## Seeding this repository`                          |

### Drop (placeholder / meta / not-prosodio)

- `experiments/WORKSPACE.md` — 3-line placeholder, no content
- `experiments/MARKDOWN.md` — already covered by our `docs/MARKDOWN.md`
- `experiments/AGENTS.md` — about experiment-dir isolation, not a real repo
- `experiments/README.md` — describes the experiments pile itself (meta)
- `experiments/ELIXIR.md` — Phoenix/Ash; prosodio is bun-only
- `bun-one/docs/RETROSPECTIVE-2026-02-02.md` — bun-one history

### Bulk drop (not docs/ material)

All per-experiment `AGENTS/PLAN/README/CLAUDE/LEARNING`,
`bookfinder-opencode/thoughts/**` (plans/research/reviews/tickets),
`bun-one/plans/**` and `plans/done/**`, `bun-one/reports/**`, starlight content
examples, app/package `README.md` files, fixtures READMEs. (~74 files.)

## Dropped (decided)

- `experiments/seeds/*.md` — dropped entirely; domain ideas get re-derived when
  we port experiments back, not harvested now.
- `bun-one/plans/BUN_ONE_QUALITY.md` — `@bun-one/quality` direction; out of
  scope for the harvest.

## Open questions (defer to the review/refactor pass)

- Tailwind `@source`/`components/` rationale: STYLING.md or WORKSPACE.md layout?
- dependabot + GitHub Actions: confirm split (Actions->WORKSPACE.md `## CI`,
  dependabot->DEPENDENCY.md).
- `thoughts/` lifecycle: define the AI-assisted dev loop (how plans/research/
  tickets/reviews flow) — then document it in FILE-LAYOUT or its own doc.
