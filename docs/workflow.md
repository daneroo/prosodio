# Workflow

Idea -> issue -> spec -> tickets -> implement -> done.

- Idea: a line in `thoughts/BACKLOG.md`.
- Issue: promoted to GitHub Issues (`daneroo/prosodio`) when worth tracking.
- Spec: `/grill-with-docs` sharpens it, `/to-spec` publishes it as a parent
  issue.
- Tickets: `/to-tickets` splits the spec into child issues (sub-issues with
  blocked-by edges). "Ticket" always means a GitHub child issue.
- Implement: `/implement` works one ticket.

Tracker conventions: `docs/agents/issue-tracker.md` (written by
`/setup-matt-pocock-skills`). Everything in `thoughts/` is transient except
`BACKLOG.md`.

Filenames in both `docs/` and `thoughts/` are lowercase kebab; only `README.md`,
`BACKLOG.md` and `CONTEXT.md` are capitalized, as recognized repository indexes.
(`docs/` was UPPERCASE until 2026-07-12 — reversed as a mistake; if you find a
reference to the old casing elsewhere, fix it.)

Prosodio's one required quality gate is `bun run ci` (see `AGENTS.md`). This
convention is shared with other repos using the same docs/thoughts model (e.g.
nix-hardy uses `just pre-commit`) — the invariant is "name one gate," not a
specific command.

## Backlog — `thoughts/BACKLOG.md`

An idea inbox: snippets worth not forgetting, not yet worth an issue. Grouped by
theme (`## player-ux`, `## corpus quality`, …); themes are the only structure.

```md
- [ ] <id> — <imperative title>; <a few lines max>
```

- `<id>`: lowercase kebab slug, unique within the file.
- Promotion: open a GitHub issue, then delete the line. The issue is the record;
  git keeps the rest.
- No scheduling and no closed history here — both live in GitHub.
- Legacy: some entries still carry `ticket:` links into `thoughts/tickets/`
  (notes from the pre-GitHub workflow). They migrate to issues with their entry;
  add no new ones.

## Working files — `thoughts/<kind>/<issue#>-<slug>.md`

Companion files for an issue, linked from its body. Kinds: `plans/` (live
checkboxes), `design/`, `research/` (where `/research` writes), `reviews/`. The
slug is short, for easy browsing: `thoughts/plans/42-player-sync.md`.

Short-lived: once the issue closes, delete the file, or move a plan to
`plans/archive/` while it is still useful as an exemplar. Prune archives once
nothing depends on them.

A plan file, when an issue warrants one:

```md
# #<issue> — <title>

Goal: <one line>.

- [ ] step
- [ ] step
```

Steps are checkboxes — the agent's live progress tracker; tick as you go.

## Delegation

Standing directive (Daniel; proven with Claude and Codex): for coding tasks, use
your judgement to decide whether delegation is worthwhile — and when it is, pick
an appropriate lower power model and effort level and run that in a subagent.
Delegation pays on substantial, spec-able tasks; small fixes found during wiring
review are cheaper done directly by the orchestrator.

When `/to-tickets` breaks work down, give each ticket a `Tier:` line with a
model class and effort recommendation, and state boundaries, risk, and
verification where not obvious. The executor may reassess when implementation
reveals new complexity. (Experiment: keep while it improves plans; drop if
models no longer need the prod.)

The tier scheme, proven in practice (`player-sync-core`, `lab-routes-refined`):

- `Tier: low` -> small model, e.g. Haiku (mechanical: renames, extractions with
  no behavior change, list pages from existing rows).
- `Tier: med` -> mid model, e.g. Sonnet (scoped feature/refactor work with a
  written spec).
- Orchestrator (the top-level agent running `/implement`): specs, wiring review,
  acceptance, commits; may promote a task a tier when implementation reveals
  complexity.

Mechanics: sequential delegation, one commit per task, the quality gate green
before each commit; subagents never commit.

## Design — `thoughts/design/<issue#>-<slug>.md`

Working system design: problem, constraints, alternatives, decisions, and open
questions. Designs explain what should be built and why; specs and tickets turn
the chosen design into executable work.

- A design may span several tickets, but should still have one clear topic.
- Superseded design drafts are consolidated rather than accumulated; Git keeps
  their history.
- When implementation settles the design, harvest what is still useful — terms
  into `CONTEXT.md`, hard-to-reverse decisions into `docs/adr/`, operational
  facts into code, tests, or durable `docs/` — then delete the transient design.
