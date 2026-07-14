# Styling

- Do not use emojis in UI — use UTF-8 characters instead if necessary.
- Tailwind v4 ignores `node_modules`; scan workspace UI with
  `@source "../../../components"`. (Why `components/` is separate from
  `packages/`.)
- Dark-shell reader/player palette (`slate`):
  - `bg-slate-900` page, `bg-slate-800` panels, `bg-slate-700` active
  - `border-slate-700/600` separators; `text-white/300/400/500` hierarchy
  - reading surface high-contrast against shell (e.g. white on dark)
- `tabular-nums` for time displays (no jitter).
- Subtle `transition-colors`; in-palette accents (`accent-slate-400`).
