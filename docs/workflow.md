# Workflow

Backlog -> plan -> implement (small commits) -> done. Everything in `thoughts/`
is transient except `BACKLOG.md`.

Filenames in `thoughts/` are lowercase kebab; only `BACKLOG.md` is capitalized.
(`docs/` is UPPERCASE by convention; `thoughts/` is not.)

## Backlog — `thoughts/BACKLOG.md`

Unscheduled work, grouped by theme (`## player-ux`, `## corpus quality`, …). The
backlog is an INDEX — readable at planning altitude in one pass. Themes are the
label system; an item's theme is the section it sits in. A `## Now` section at
the top lists the next scheduled ids, in order.

```md
- [ ] <id> — <imperative title>; <a few lines max> ticket:
      [<id>](tickets/<id>.md) <- only when detail outgrew the entry
```

- `<id>`: stable lowercase kebab slug, unique; doubles as the ticket/plan
  filename (e.g. `catalog-workflow-doc`, `player-sync-core`).
- An index entry stays a few lines. When detail outgrows it, move the detail to
  `tickets/<id>.md` and leave a one-line summary + `ticket:` link.
- Closing: move the item's line to `## Closed (newest first)` with a date and a
  one-line outcome (+ archive link if a plan ran); delete its ticket. The Closed
  section doubles as the `plans/archive/` index; prune old lines freely — git
  keeps everything.

## Ticket — `thoughts/tickets/<id>.md`

Working detail for ONE backlog item: evidence, options, constraints, decisions
pending. `# <id> — <title>` then a terse freeform body; no schema.

- Created only when an item's detail outgrows its index entry.
- Deleted on close — tickets are never archived. Harvest durable facts into
  `docs/` (or the executing plan) first; git history keeps the forensics.

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
- Closing: move the item to BACKLOG's Closed section and commit that; the
  backlog keeps the record. A `done` plan may then be either deleted or moved to
  `plans/archive/<id>.md` and kept while it's still useful — as a worked
  exemplar, or because live backlog items still reference it. Archived plans are
  not permanent: prune them once nothing depends on them, and don't index them
  by directory listing — the Closed section (newest first) is the index.

Plan coding tasks for delegation and routing, not only sequencing. Each task
should provide enough context to select an appropriate subagent model class and
effort level without reconstructing the design. State its boundaries,
dependencies, risk or ambiguity, acceptance criteria, and verification where
they are not obvious. Recommend model or effort when useful, but let the
executor reassess when implementation reveals new complexity.

## Design — `thoughts/design/<id>-design.md`

Working system design: problem, constraints, alternatives, decisions, and open
questions. Designs explain what should be built and why; plans turn the chosen
design into executable checkboxes.

- Prefer the plan's exact `<id>` plus `-design`, so `plans/epoch4-alignment.md`
  and `design/epoch4-alignment-design.md` sort and search together naturally.
- A design may span several plan steps, but should still have one clear topic.
- Superseded design drafts are consolidated rather than accumulated; Git keeps
  their history.
- When implementation settles the design, move any still-useful operational
  facts into code, tests, package/app documentation, or durable `docs/` as
  appropriate, then delete the transient design.

## Scale-up path

When the flat backlog hurts — real dependencies between issues, or it outgrows a
screen — adopt a git-native tracker (e.g. beads); it ingests this list
trivially. Cross-repo aggregation is its own problem, out of scope here.
