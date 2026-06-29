# Workspace

## Quality gate

- `bun run ci` — the one command: after every edit, before every commit. CI
  (GitHub Actions) runs the same `ci`.
- `bun run fmt` — fixes formatting when `ci` fails.

## Testing gotchas

- React components: RTL needs a DOM, bun has none. Register `happy-dom` per-file
  via dynamic import so it loads before RTL:

  ```ts
  GlobalRegistrator.register();
  const { render } = await import("@testing-library/react");
  ```

- Apps with their own build are excluded from root `tsc` and run their own
  `check` (Astro -> `astro check`; Vite version conflicts). eslint ignores
  `**/.astro/`.

## Seeding this repository

The validated recipe — follow it instead of re-planning. Configs are generated
(`bun init`, `bun add`), then edited; never hand-write versions.

- `git init` first, then `LICENSE` + `README` + `AGENTS.md` + thin `CLAUDE.md`.
- `bun init -y` (non-destructive: keeps README/CLAUDE, merges package.json).
  Delete its `.cursor/` and `index.ts`; drop the dead `"module"` field.
- Workspaces `packages/* components/* apps/*`; empty `catalogs.runtime`.
- `bun add -d prettier eslint @eslint/js typescript-eslint markdownlint-cli2`.
- `.vscode/`: per-language single `[lang]` blocks -> prettier (single-language
  block beats a user `[lang]` override; multi-language block loses).
- `smoke-remove-me.test.ts` so `ci` passes on the empty workspace; delete when
  real tests arrive.
