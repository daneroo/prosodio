<!-- ported from ai-garden@9b076ed88:experiments/BUN_TANSTACK.md + bun-one/docs/WORKSPACE-BUN.md -->

# TanStack Start (bun)

Bootstrap specifics only.

- Create:
  `bunx --bun @tanstack/cli create <dir> --package-manager bun --framework React --add-ons nitro --no-git`
- Nitro Vite plugin with bun preset: `nitro({ preset: "bun" })`.
- Scripts use bun-driven Vite: `bun --bun vite dev|build|preview`.
- Alias `@/*` -> `./src/*` in `tsconfig.json` + Vite.
- If scaffold misses `src/router.tsx`, add it (export `getRouter()` from
  `createRouter({ routeTree })`).
