# Formatting

How code and docs get formatted and linted. For markdown authoring style, see
[MARKDOWN.md](MARKDOWN.md).

## Tools

Two tools, one job each:

- Prettier formats. It owns whitespace, wrapping, quoting, and table alignment
  across `.ts`, `.js`, `.json`, `.jsonc`, and `.md`.
- markdownlint-cli2 lints structure. It catches the problems prettier does not:
  duplicate top-level headings, fenced code without a language, missing trailing
  newline, and similar.

They do not overlap: the markdownlint config extends the prettier-compatible
preset, which disables every rule prettier already handles. So the two never
disagree.

## Prettier

Config lives in `package.json` under the `prettier` key (package.json must be
strict JSON, so the rationale lives here, not in an inline comment):

- `proseWrap: always` — reflow prose to the print width. This is a deliberate
  deviation from prettier's `preserve` default: it makes wrapping mechanical and
  enforceable instead of a per-author judgment call. The cost is that editing a
  word can reflow a paragraph.
- Print width is the default 80. Both prettier and `deno fmt` default to 80, so
  it is the least surprising choice; we dropped an earlier 100 override.

`.prettierignore` excludes generated artifacts (`bun.lock`).

### Why prettier and not deno fmt

`deno fmt` was used in some ai-garden experiments for its markdown table
alignment. We are prettier-only here (no deno in the toolchain). Prettier's
table alignment was checked against deno's and matches (see Proof below), so the
table concern that motivated deno does not apply.

## markdownlint

A single `.markdownlint-cli2.jsonc` holds both behavior and rules:

- `extends: "markdownlint/style/prettier"` — the prettier-compatible rule set.
- `gitignore: true` — globbing skips `node_modules/`, `out/`, `dist/` via
  `.gitignore`.

It reads no config from `package.json` (that needs an awkward
`--configPointer`), so it keeps its own file. One file, not the two that
ai-garden's experiments had.

The commands that run these tools (`fmt`, `lint:md`, `ci`, …) are listed in
[AGENTS.md](../AGENTS.md).

## Re-validation / Proof

The guarantees above are reproducible. To re-verify:

- Table alignment matches deno: paste a deliberately ragged GFM table into a
  `.md`, run `bun run fmt`, confirm columns and the separator row align.
- Structural linting bites: introduce a duplicate `#` heading, an unlabeled
  fence, or strip the trailing newline; `bun run lint:md` flags MD025, MD040,
  MD047.
- Formatting is idempotent: run `bun run fmt` twice; the second pass changes
  nothing.
- The CLI is the ground truth: `bun run fmt:check && bun run lint:md` exit 0 on
  a clean tree.
- The editor mirrors the CLI: saving a `.md` formats it identically to
  `bun run fmt` (see the `.vscode` settings).

## Source

Decisions validated during the prosodio seed; see the plan's Progress Log.
Markdown tooling notes adapted from ai-garden `experiments/MARKDOWN.md` and
`bun-one/plans/BUN_ONE_QUALITY.md`.
