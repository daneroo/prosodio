# Seeding a Bun monorepo

The validated recipe used to seed this repo. Follow it instead of re-planning.
Formatting detail: [FORMATTING.md](FORMATTING.md).

## Rules

- Configs are generated (`bun init`, `bun add`), then edited deliberately.
- Never hand-write dependency versions — they come from the registry.
- `git init` before any file; each step is one small commit.

## Steps

- `git init`, then `LICENSE` + `README` + `AGENTS.md` (+ thin `CLAUDE.md`).
- `bun init -y`. Non-destructive: keeps existing README/CLAUDE, merges
  package.json, ignores AGENTS. Delete its `.cursor/` and `index.ts`; drop the
  dead `"module"` field.
- Workspaces in package.json: `packages/*`, `components/*`, `apps/*`; empty
  `catalogs.runtime` (add an entry only when a dep is shared by 2+ packages).
- Dev tooling:
  `bun add -d prettier eslint @eslint/js typescript-eslint markdownlint-cli2`.
  typescript stays a peerDependency.
- `eslint.config.js`: `js.configs.recommended` + `tseslint.configs.recommended`
  - an `ignores` block.
- Formatting: prettier config in package.json (`proseWrap: always`); one
  `.markdownlint-cli2.jsonc` extending `markdownlint/style/prettier`;
  `.prettierignore` for `bun.lock`.
- Scripts:
  `fmt fmt:check lint lint:js lint:md check test test:e2e ci outdated outdated:fix`.
  `lint` = js + md; `ci` = fmt:check + lint + check + test.
- `.vscode/`: per-language single `[lang]` blocks → prettier (a single-language
  block beats a user's `[lang]` override; a multi-language block loses).
- Scaffold dirs with `.gitkeep`; gitignore `data/` (volatile).
- One root `smoke-remove-me.test.ts` so `bun test`/`ci` pass on the empty
  workspace; remove when real tests arrive.
