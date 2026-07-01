# BACKLOG

Unscheduled work. Format: see [docs/WORKFLOW.md](../docs/WORKFLOW.md). Ported
as-is from the consolidation plan's "Issues to address later"; triage pending.

- [ ] promote-app-config — promote transcribe's `lib/config.ts` to a shared
      `packages/config`
  - state: deferred out of epoch1-transcribe
  - today it is single-app path config: a `DATA_DIR`-rooted `data/<app>/…` tree
    plus a REPO_ROOT-anchored `fixturesDir`. Promote to `packages/config` with
    `DATA_DIR` / `CORPORA_DIR` env overrides.
  - revisit-when: a second app (epub/alignment) needs shared path config.

- [ ] agents-md-convention — are AGENTS.md/CLAUDE.md required and respected, and
      which wins?
  - state: provisional
  - which wins when AGENTS.md, CLAUDE.md, and `.cursor/rules` coexist? Current
    seed is a minimal placeholder.
  - reconcile against existing examples (`bun-one/CLAUDE.md`, the experiments'
    CLAUDE/AGENTS files, bun init's generated CLAUDE.md + `.cursor` rule).
  - revisit-when: after a few epochs actually exercise an agent here.

- [ ] mdx-linting — formatting/linting for `.mdx` when frameworks land
  - state: open, defer
  - prettier has an mdx parser, but `lint:md` glob `**/*.md` won't match `.mdx`
    and markdownlint doesn't lint mdx.
  - decide then: format mdx with prettier? add an `[mdx]` block to
    `.vscode/settings.json`? extend/separate the lint glob? structural linter?
  - revisit-when: the first `.mdx` file (Astro/TanStack).

- [ ] catalog-workflow-doc — document the `workspaces.catalogs` workflow
  - state: todo at docs time
  - `catalogs.runtime` seeded empty; add an entry only when a dep is shared by
    2+ packages — pin one version, consumers reference `catalog:runtime`.
    Demand-driven, not speculative.
  - multiple named catalogs expected (bun-one runs `runtime` (zod, valibot) and
    `testing` (@testing-library/react)); add `testing` when test deps arrive.
  - write up in `docs/DEPENDENCY.md`; ref shape in
    `bun-one/docs/WORKSPACE-BUN.md`.

- [ ] sanity-reconcilers — desired -> actual convergence validators
  - state: principle; post-seed; pairs with the `@bun-one/quality` direction
  - k8s-style: state DESIRED generally, compute ACTUAL from the source of truth,
    report/converge the diff. Mechanism is open (jq, bun script, CUE — not the
    point); the loop is. Enforces invariants the type system/formatters can't.
  - naming: `sanity:<thing>` (e.g. `sanity:editor`, `sanity:catalog`), umbrella
    `sanity` runs all, gateable in `ci`. Placeholder `sanity` script exists now.
  - known instances (extensible):
    - editor settings: desired = settings we care about (formatter routing,
      format-on-save, rulers…); actual = layered `.vscode`/user JSON. PROVEN
      kernel: `jsonc-parser` via bun -> jq. Demonstrated on Cursor.
    - package.json invariants: catalog hoisting (dep in 2+ packages MUST be a
      `catalog:` entry), allowed fields, version-pin policy, script presence.

- [ ] document-prosewrap — document line length + proseWrap choices
  - state: todo at docs time (in `docs/FORMATTING.md`/`docs/MARKDOWN.md`)
  - decided: `proseWrap: always` (deviation from `preserve`; price is reflow
    churn) and width = prettier default 80 (dropped the 100 override).
  - package.json can't carry comments (strict JSON) so rationale lives in docs.
  - revisit-when: 80 proves cramped for tables/code-in-prose.

- [ ] dependency-update-doc — document the update workflow
  - state: todo
  - `outdated` only reports (`bun outdated -r`). bun 1.3.14: `bun update` =
    within-range; `--latest` = bump past ranges, all, non-interactive;
    `bun update -i -r` = native interactive recursive picker (flags work though
    absent from --help). Beats `npm-check-updates -i`.
  - implemented as `outdated:fix` (`bun update -i -r`).
  - CAVEAT: verify it handles `catalog:` references; catalog bumps may need
    separate handling.
  - revisit-when: the first dependency goes stale.

- [ ] dotfile-ownership — who owns generated dotfile decisions?
  - state: open
  - bun init (and later tool inits) generate dotfiles whose embedded decisions
    (tsconfig strictness, ignore globs, version floors) nobody explicitly chose.
    "Generated" is not "decided".
  - candidate direction: a central config-owning package (cf.
    `bun-one/plans/BUN_ONE_QUALITY.md`, the `@bun-one/quality` idea).
  - revisit-when: dotfile sprawl across packages becomes painful.

- [x] prettier-tables-vs-deno — validate prettier md tables vs deno fmt
  - state: validated 2026-06-28 (doc-write folded into document-prosewrap)
  - a ragged GFM table through prettier came out byte-identical to deno's
    aligned output; Daniel confirmed format-on-save aligns in Antigravity.
    prettier-only is safe for tables.
  - spot-check on first real occurrence: alignment markers (`:---:`), very-wide
    tables, CJK width.
