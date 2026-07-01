# Workflow

Backlog -> plan -> implement (small commits) -> done. Everything in `thoughts/`
is transient except `BACKLOG.md`.

Filenames in `thoughts/` are lowercase kebab; only `BACKLOG.md` is capitalized.
(`docs/` is UPPERCASE by convention; `thoughts/` is not.)

## Backlog — `thoughts/BACKLOG.md`

Unscheduled work. One issue per top-level item; the templates here are the
schema (a validator can enforce them later).

```md
- [ ] <id> — <imperative title>
  - why: <one line>
  - <nested detail / sub-point / ref>
```

- `<id>`: stable lowercase kebab slug, unique; doubles as the plan filename
  (e.g. `catalog-workflow-doc`, `mdx-linting`, `epoch1-transcribe`).
- Nest freely for detail; no prose paragraphs.
- `[x]` when the issue's plan is done and merged. The backlog keeps the record.

## Plan — `thoughts/plans/<id>.md`

Written when an issue is scheduled. One issue, small enough for clear steps.

```md
# <id> — <title>

Status: planned | active | done

Goal: <one line>.

- [ ] step
- [ ] step
```

- Status: `planned` (not started) -> `active` (in progress) -> `done` (closed).
- Steps are checkboxes — the agent's live progress tracker; tick as you go.
- Optional notes beside it: `<id>-research.md`, `<id>-review.md`, only if
  warranted.
- Closing: tick `[x]` in BACKLOG and commit that; a _separate_ commit deletes
  the plan (and notes) — the backlog keeps the record. Default is deletion on
  `done`; a `done` plan may linger briefly if it still interacts with ongoing
  work (e.g. sibling epochs), then gets deleted.

## Scale-up path

When the flat backlog hurts — real dependencies between issues, or it outgrows a
screen — adopt a git-native tracker (e.g. beads); it ingests this list
trivially. Cross-repo aggregation is its own problem, out of scope here.
