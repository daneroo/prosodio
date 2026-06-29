# Workspace

Script targets, the quality gate, testing, CI, and the seeding recipe. Layout in
[FILE-LAYOUT.md](FILE-LAYOUT.md); dependency mechanics in
[DEPENDENCY.md](DEPENDENCY.md).

Merged from ai-garden@9b076ed88:bun-one/docs/WORKSPACE-BUN.md and
docs/SEEDING.md.

## Members

- `workspaces`: `packages/*`, `components/*`, `apps/*`.
- Each member: own `package.json` with at least a `name`.
- Members import each other by name via `workspace:*` (see DEPENDENCY.md).

## Script targets

- `ci` — `fmt:check && lint && check && test` (the gate)
- `fmt` / `fmt:check` — prettier `--write` / `--check`
- `lint` — `lint:js && lint:md`
  - `lint:js` — eslint
  - `lint:md` — markdownlint-cli2
- `check` — `tsc --noEmit`
- `test` / `test:e2e` — `bun test` / `RUN_E2E_TESTS=1 bun test`
- `outdated` / `outdated:fix` — `bun outdated -r` / `bun update -i -r`
  (interactive); see DEPENDENCY.md

## Quality gate

- `bun run ci` — the directive: after every edit, before every commit.
- `bun run fmt` — the remediation when `ci` fails on formatting.

## Testing

- Logic: `bun test`, no extra config.
- React components: RTL needs a DOM, which bun (server runtime) lacks. Use
  `happy-dom`, registered per-file via dynamic import so it loads before RTL —
  avoids global pollution.

```typescript
GlobalRegistrator.register();
const { render } = await import("@testing-library/react");
```

## Continuous integration

- GitHub Actions runs `bun run ci` — same gate, no second source of truth.
- dependabot config lives with dependency policy in DEPENDENCY.md.
- Workflow files not added yet.

## Configuration exceptions

- Apps with their own build (`tsconfig.json`) are excluded from root
  `tsc --noEmit` and run their own `check`:
  - Astro needs `astro check` for `astro:content` virtual modules.
  - Vite apps hit version conflicts under root `tsc`.
- eslint ignores generated dirs, including `**/.astro/`.

## Seeding this repository

The validated recipe. Follow it instead of re-planning.

- Configs are generated (`bun init`, `bun add`), then edited deliberately —
  never hand-write dependency versions; they come from the registry.
- `git init` before any file; each step is one small commit.

Steps:

- `git init`, then `LICENSE` + `README` + `AGENTS.md` (+ thin `CLAUDE.md`).
- `bun init -y`. Non-destructive: keeps existing README/CLAUDE, merges
  package.json, ignores AGENTS. Delete its `.cursor/` and `index.ts`; drop the
  dead `"module"` field.
- Workspaces in package.json: `packages/*`, `components/*`, `apps/*`; empty
  `catalogs.runtime` (add an entry only when a dep is shared by 2+ packages).
- Dev tooling:
  `bun add -d prettier eslint @eslint/js typescript-eslint markdownlint-cli2`.
  typescript stays a peerDependency.
- `eslint.config.js`: recommended configs from `@eslint/js` and
  `typescript-eslint`, plus an `ignores` block.
- Formatting: prettier config in package.json (`proseWrap: always`); one
  `.markdownlint-cli2.jsonc` extending `markdownlint/style/prettier`;
  `.prettierignore` for `bun.lock`. See [FORMATTING.md](FORMATTING.md).
- Scripts: the targets above; `lint` = js + md, `ci` = fmt:check + lint +
  check + test.
- `.vscode/`: per-language single `[lang]` blocks -> prettier (a single-language
  block beats a user's `[lang]` override; a multi-language block loses).
- Scaffold dirs with `.gitkeep`; gitignore `data/` (volatile).
- One root `smoke-remove-me.test.ts` so `bun test`/`ci` pass on the empty
  workspace; remove when real tests arrive.
