# Formatting

Prettier formats, markdownlint lints structure. Authoring style:
[MARKDOWN.md](MARKDOWN.md). Commands: [AGENTS.md](../AGENTS.md).

## Config

- Prettier: config in `package.json`. `proseWrap: always`, width 80 (default).
  `.prettierignore` skips `bun.lock`.
- markdownlint: `.markdownlint-cli2.jsonc`,
  `extends: markdownlint/style/prettier` (no overlap with prettier),
  `gitignore: true`.
- Prettier-only, no deno. Prettier's table alignment matches deno's (verified).

## Split

- Prettier: whitespace, wrapping, quotes, tables.
- markdownlint: what prettier ignores — MD025 (dup H1), MD040 (unlabeled fence),
  MD047 (trailing newline).

## Re-validate

- Ragged table + `fmt` → aligned.
- Break a heading/fence/newline → `lint:md` flags it.
- `fmt` twice → no change.
- `fmt:check && lint:md` → exit 0.
- Save a `.md` in the editor → same as `fmt` (see `.vscode`).
