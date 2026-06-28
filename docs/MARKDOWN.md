# Markdown

Authoring conventions for markdown in this repo. For the tooling that enforces
formatting (prettier) and structure (markdownlint), see
[FORMATTING.md](FORMATTING.md).

## Style

These are the choices a human makes; the formatter cannot infer them.

- Prefer unnumbered lists (`-`). Numbered lists make insertion and reordering
  painful, and the numbers drift.
- Prefer unnumbered headings (no `1.`, `2.`) for the same reason.
- Use bold and italics sparingly. Heavy bolding makes the raw markdown harder to
  read than the rendered output.
- No emojis unless explicitly requested.
- Write markdownlint-friendly: one top-level `#` heading per file, fenced code
  blocks carry a language, files end with a single trailing newline.

## What you do not manage

Prettier handles whitespace mechanics automatically, so do not fuss over them:
blank lines around headings and lists, list-marker style, and line wrapping all
get normalized on `bun run fmt`. Write the content; let the formatter place the
spaces.

## Conventions

- Documentation filenames separate words with dashes, not underscores (e.g.
  `CODING-STYLE.md`, `WORKSPACE-BUN.md`).

## Source

Adapted from ai-garden `experiments/MARKDOWN.md` and `bun-one/AGENTS.md`
(`## Markdown Rules`).
