<!-- ported from ai-garden@9b076ed88:bun-one/docs/WORKSPACE-BUN.md -->

# Astro / Starlight (bun)

Bootstrap specifics only.

- Create:
  `bun create astro apps/<dir> --template starlight/tailwind --no-git --install`
- React for shared components: `bun add @astrojs/react react react-dom`.
- Workspace dep: hand-add `"@scope/x": "workspace:*"`, `bun install` from root.
- Excluded from root `tsc` (`astro:content` virtual modules) — use
  `astro check`. eslint ignores `**/.astro/`.
