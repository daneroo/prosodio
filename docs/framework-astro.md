# Astro / Starlight (bun)

> Status: not validated in prosodio — ported notes, not yet run here.

Bootstrap specifics only.

- Create:
  `bun create astro apps/<dir> --template starlight/tailwind --no-git --install`
- React for shared components: `bun add @astrojs/react react react-dom`.
- Workspace dep: hand-add `"@scope/x": "workspace:*"`, `bun install` from root.
- Excluded from root `tsc` (`astro:content` virtual modules) — use
  `astro check`. eslint ignores `**/.astro/`.
