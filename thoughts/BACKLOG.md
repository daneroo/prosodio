# BACKLOG

Unscheduled work, grouped by theme. Format:
[docs/WORKFLOW.md](../docs/WORKFLOW.md). This file is an INDEX — entries stay a
few lines; items whose detail outgrows that carry a `ticket:` link into
[tickets/](tickets/).

## Now

Next scheduled work, in order (grooming decision 2026-07-10):

1. `player-sync-core` — the player-ux + component-boundary cleanup
2. `matching-quality-design` — workstream kickoff (design doc, not a plan)
3. `lab-routes` — fold into the first change that touches those routes

## player-ux

- [ ] player-sync-core — one canonical sync state (playhead <-> matched span <->
      book location) owned by the player; panels become optional subscribers;
      EPUB -> audio reverse sync (double-click a word, seek). ticket:
      [player-sync-core](tickets/player-sync-core.md)
- [ ] lab-routes — rename `/dev/*` to `/lab/*`; "sweep" -> "locate"; reserve the
      per-surface summary + `$bookId` detail route map. ticket:
      [lab-routes](tickets/lab-routes.md)
- [ ] bookplayer-ebook-renderer — keep the EPUB renderer swappable; evaluate
      epub.js alternatives when search/highlight or theming becomes a real
      limitation. ticket:
      [bookplayer-ebook-renderer](tickets/bookplayer-ebook-renderer.md)
- [ ] bookplayer-public-acceptance — committed public-fixture browser acceptance
      for search -> navigate -> highlight; decide the harness (no local
      Playwright). ticket:
      [bookplayer-public-acceptance](tickets/bookplayer-public-acceptance.md)
- [ ] bookplayer-serve-vtt-track — serve the VTT to the media element
      (`<track>`); kept open by design D9. Revisit when native captions become a
      real want.
- [ ] bookplayer-media-chrome — consider Media-Chrome web components
      ([react version](https://www.media-chrome.org/docs/en/react/get-started)).

## alignment quality

- [ ] matching-quality-design — design the next matcher iteration: metrics
      beyond coverage, gap heuristics (skipped words), and content qualification
      — front/back matter, footnotes read or skipped, audio-only segments that
      break linearity. Runs on the existing loop: CLI computes -> reports
      persist -> lab views render. Design doc first; plans follow.
- [ ] align-precision-at-scale — automated precision signal over the corpus;
      manual `reviewSamples` reading does not scale to ~700 books. ticket:
      [align-precision-at-scale](tickets/align-precision-at-scale.md)
- [ ] align-better-fixture-pair — replace the abridged Alice fixture; want >=2
      faithful public narration<->edition pairs (id stable; shared with
      bookplayer). ticket:
      [align-better-fixture-pair](tickets/align-better-fixture-pair.md)
- [ ] locate-sweep-epubjs-console-noise — epub.js emits internal `substitute`
      TypeErrors during the sweep's renderless `section.load`; cosmetic, results
      unaffected, low priority.

## corpus quality

- [ ] bookplayer-calibre-html-locate — the two Calibre `.html` books sweep 0-ok
      (document-prolog divergence, root off-by-one). Decide: replace the books
      (cheap) or documentElement-anchoring fix (general, schema bump). ticket:
      [bookplayer-calibre-html-locate](tickets/bookplayer-calibre-html-locate.md)
- [ ] epub-calibre-pollution-audit — Calibre bookmark files silently change epub
      sha256 (141 + 167 flagged 2026-07-03); decide strip/prevent/CI-gate.
      ticket:
      [epub-calibre-pollution-audit](tickets/epub-calibre-pollution-audit.md)
- [ ] align-soft-basename-match — case-insensitive VTT<->epub pairing fallback
      (books missed on filename case only). Corpus DIRECTORIES cannot be renamed
      (audiobookshelf history); `.epub` rename or a soft fallback in
      `apps/align/lib/discovery.ts` (exact-first, refuse on ambiguity).
- [ ] storyteller-package-doc-failures — 17 books fail Storyteller "could not
      read the package document"; not EPUB 2, both epub.ts paths open them.
- [ ] epub-toc-href-validation — resolve nav hrefs against manifest/spine;
      settles the TOC href-baseline ambiguity in the FINDINGS doc.
- [ ] epubts-node-jsdom-always — consider dropping the LinkeDOM-first hybrid for
      jsdom-always (jsdom opens every book LinkeDOM hangs on; simpler, some
      speed cost). Also carries epoch4's open compromise 1: align forces jsdom
      in-process, bypassing the hybrid proven over 756 books, with no subprocess
      hang guard.
- [ ] epub-text-extraction-gate — text-content extraction gate (10B) in
      epub-validate; raw spine bytes already agree. Revisit when downstream
      needs it.
- [ ] epub-report-html — replace the file-tree markdown report with a single
      static self-contained HTML view.
- [ ] epoch3-audiobook-validation — assess/port the useful parts of nx-audiobook
      collection validation (validate, validators, file-walking); do NOT unify
      models just because both say "validation"; exclude the old
      viewer/conversion surface.

## infra

- [ ] promote-app-config — shared `packages/config` (four consumers now); the
      first brick of any future data-plane extraction. ticket:
      [promote-app-config](tickets/promote-app-config.md)
- [ ] sanity-reconcilers — desired -> actual convergence validators
      (`sanity:<thing>`); editor settings + package.json invariants first.
      ticket: [sanity-reconcilers](tickets/sanity-reconcilers.md)
- [ ] align-cli-rename — rename `apps/align/` to match its CLI-only role (npm
      name already `@prosodio/align-cli`); must ship with a full reference
      sweep. Revisit when align-cli gets real work.
- [ ] dotfile-ownership — generated dotfiles carry decisions nobody chose;
      candidate: a central config-owning package (cf. `@bun-one/quality`).
      Revisit when sprawl hurts.
- [ ] agents-md-convention — AGENTS.md/CLAUDE.md/`.cursor/rules` precedence;
      reconcile the existing examples. Revisit after agents exercise this repo
      more.
- [ ] mdx-linting — `.mdx` formatting/linting (prettier mdx parser vs
      markdownlint gap). Revisit at the first `.mdx` file.

## docs workflow

- [ ] docs-taxonomy — grouped `docs/` index landed 2026-07-10 (working-here /
      pipeline-and-data / frameworks; flat files, index in docs/README.md).
      Remaining: write DATA-CONTRACTS.md (per-artifact axes — deterministic?
      stored or cached? transported? schema-versioned? — and the version policy:
      single client, a version bump is a cache-invalidation tool, not a compat
      promise) and ALIGNMENT.md (matcher pass contracts, extraction parse-mode
      policy, L1/L2/L3 validation ladder) by harvesting `thoughts/design/`;
      prune the harvested designs after.
- [ ] catalog-workflow-doc — document the `workspaces.catalogs` workflow in
      `docs/DEPENDENCY.md`; demand-driven (entry only at 2+ consumers), named
      catalogs (`runtime`, `testing`) expected.
- [ ] document-prosewrap — record `proseWrap: always` + width 80 rationale in
      docs (FORMATTING/MARKDOWN); include the prettier-tables validation
      (byte-identical to deno fmt, 2026-06-28; spot-check alignment markers,
      very-wide tables, CJK width).
- [ ] dependency-update-doc — document the update workflow (`outdated:fix` =
      `bun update -i -r`); CAVEAT: verify `catalog:` reference handling. Revisit
      at the first stale dep.

## Closed (newest first)

One line per closed item — this section doubles as the `plans/archive/` index.
Prune old lines freely; git keeps everything.

- 2026-07-10 bookplayer-epub-locator-hardening — predicted-mode mismatch class
  fixed (extension-driven parsing, schema v3); L2/L3 tooling + sweep persistence
  built; corpus 91/93 clean. Residual split to `bookplayer-calibre-html-locate`.
  [plans/archive/bookplayer-locate-hardening.md](plans/archive/bookplayer-locate-hardening.md)
- 2026-07-10 align-epub-parser-decisions — compromise 2 (parse mode) RESOLVED
  extension-driven, mirroring epub.js (evidence in the locate-hardening plan);
  compromise 1 (jsdom forced in-process) folded into `epubts-node-jsdom-always`.
- 2026-07-09 bookplayer-align-refine-model — AlignmentArtifact v2: one versioned
  columnar artifact, deterministic bytes, cached and served as-is.
  [plans/archive/bookplayer-align-refine-model.md](plans/archive/bookplayer-align-refine-model.md)
- 2026-07-05 bookplayer-alignment-layout — AlignmentViewer panel, 50/50 split,
  show-in-book, playback-synced three-view follow; engine extracted to
  `packages/align`. Carried forward: follow requires the panel open — now the
  core of `player-sync-core`.
  [plans/archive/bookplayer-align.md](plans/archive/bookplayer-align.md)
- 2026-07-04 bookplayer — the Prosodio Bookplayer app (reader-first player over
  the canonical library), consolidating the ai-garden experiments.
  [plans/archive/bookplayer.md](plans/archive/bookplayer.md)
- 2026-06-28 prettier-tables-vs-deno — prettier md tables byte-identical to deno
  fmt; doc-write folded into `document-prosewrap`.
- earlier — epochs 0-4 of the consolidation: see
  [plans/archive/](plans/archive/) (epoch1-transcribe, epoch2-epub,
  epoch4-alignment) and the superseded align design records there
  (bookplayer-align-bad-design, bookplayer-align-refine-model-codex-comments —
  prune candidates).
