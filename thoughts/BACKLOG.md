# BACKLOG

Unscheduled work, grouped by theme. Format:
[docs/workflow.md](../docs/workflow.md). This file is an INDEX — entries stay a
few lines; items whose detail outgrows that carry a `ticket:` link into
[tickets/](tickets/).

## Now

Scheduled items go here (leave this comment)

## player-ux

- [ ] bookplayer-epub-teardown-race — rapid hard navigation can tear down
      epub.js while async `Rendition.start`/`replaceCss` work is still running,
      emitting warnings. Separate from the resolved OOM and locate-sweep console
      noise.
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

- [ ] align-known-mismatch-convention — a convention for marking epub/audio
      pairs that are legitimately non-faithful renditions, so their low coverage
      reads as "known mismatch", not pipeline failure. Live cases: A Wizard of
      Earthsea BBC dramatization paired with the original ebook (27% narration /
      5.8% book, caught by /lab/alignment 2026-07-19); fixtures Alice
      abridged-vs-unabridged. Decide the marker (naming, sidecar, curated list)
      and how lab surfaces render it. Relates: `align-better-fixture-pair`,
      `corpora-omnibus-mapping`.

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

- [ ] metadata-canonical-from-tags — m4b tags are the canonical truth for
      title/author/series; basename is a fallback only when tags are absent.
      FIRST STAB LANDED (2026-07-19, commit d1d7698): title/author inverted to
      tags-first + cache v3 re-probe + `docs/corpora/metadata.md`; verified on
      the private corpus. Evidence gathered: title 952/952, artist 952/952 =
      100% clean; `grouping` (series) 224/952 (23%); `composer` (narrator)
      936/952. Fixtures are worst-case demonstrators — jfk.m4b all-null, Alice
      title tag `AliceWonderland8_librivox`. REMAINING (full pass, plan
      `plans/metadata-canonical-from-tags.md`): a dedicated extractor module;
      `series[]` {name, position|null} from `grouping` (semicolon-separated,
      each `<name> #<pos>`, MULTI-series real — one Discworld book lists both
      `Discworld #34` and `Discworld: Ankh-Morpork City Watch #7`), deferred to
      the corpora-validation work; `narrator`; and a
      `metadata-basename-fallback` finding on the Corpora tab. Blocks
      book-metadata-identity; relates `merge-nx-audiobook-validation` (findings
      surface), `align-better-fixture-pair` (bad metadata test data too).
- [ ] book-metadata-identity — possibly use canonical metadata as the bookId
      (suffixed with a short sha digest, 5-7 hex). GATED on
      `metadata-canonical-from-tags` first (tag reliability now proven, 100%
      title+author). Big blast radius (alignment artifact cache keys,
      locate-sweep reports, localStorage progress, URLs) and a digest-input
      decision (basename = rename-fragile; file content = rename-stable but
      reads every m4b). Needs its own design + migration story before code.
- [ ] corpora-omnibus-mapping — some EPUBs are omnibus editions mapping to MANY
      audiobooks (Neal Stephenson, Baroque Cycle: the "Quicksilver" audiobook
      dir contains an epub covering volumes 01-02-03; other series omnibuses
      known). Discovery/pairing assumes 1:1 — decide how to represent
      1-epub:N-audiobooks (and the alignment window per audiobook: each book
      would match a SUB-RANGE of the epub, breaking the whole-book linearity
      assumption). Relates: `align-soft-basename-match`, and the
      matching-quality content-qualification direction.
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
- [ ] merge-nx-audiobook-validation — merge the useful validation rules from
      `~/Code/iMetrical/nx-audiobook` (nx monorepo, `apps/validate`; also the
      `just checkfiles` target): file/dir perms 644/755, macOS xattr cleanup
      where possible, naming conventions, plus the validators/file-walking worth
      porting. Corpora tab findings are the natural render surface
      (file-mode/xattr issues = new finding codes). Do NOT unify models just
      because both say "validation"; exclude the old viewer/conversion surface.
      (Renamed from epoch3-audiobook-validation 2026-07-19.)

## infra

- [ ] bookplayer-runtime-parity — make the built Bookplayer serve every route,
      including alignment; pass burn-in and iPad ad-hoc checks in development
      and production, explicitly exercising Node and Bun execution rather than
      assuming `bun run` selects the runtime.
- [ ] promote-app-config — shared `packages/config` (four consumers now); the
      first brick of any future data-plane extraction. ticket:
      [promote-app-config](tickets/promote-app-config.md)
- [ ] e2e-testing-harness — we need a full e2e test harness which will include a
      "real" server start, and run tests (including a burn-in equivalent on it
      to catch server-lifecycle memory leaks, but surely many other tests when
      we have a good setup). Long-running/private-corpus cases should use a
      targeted `*.e2e.test.ts` filename and explicit E2E command lane rather
      than joining the default unit-test run.
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

- [ ] locate-sweep-doc-coherence — re-read `docs/bookplayer/locate-sweep.md`
      against the current `/lab/locate` page. The doc predates
      lab-routes-refined S5 (matched/all mode toggle, report file v2, the
      `failed > 0` = bug framing); confirm what it says an `ok`/sweep means
      still matches, and refresh it if not.
- [ ] docs-taxonomy — grouped `docs/` index landed 2026-07-10 (working-here /
      pipeline-and-data / frameworks; flat files, index in docs/README.md).
      Remaining: write data-contracts.md (per-artifact axes — deterministic?
      stored or cached? transported? schema-versioned? — and the version policy:
      single client, a version bump is a cache-invalidation tool, not a compat
      promise) and alignment.md (matcher pass contracts, extraction parse-mode
      policy, L1/L2/L3 validation ladder) by harvesting `thoughts/design/`;
      prune the harvested designs after. The harvest now also covers
      `design/matching-quality-design.md` (Daniel, P3.2 2026-07-12: revisit the
      baseline when it is digested and simplified into docs/).
- [ ] catalog-workflow-doc — document the `workspaces.catalogs` workflow in
      `docs/dependency.md`; demand-driven (entry only at 2+ consumers), named
      catalogs (`runtime`, `testing`) expected.
- [ ] document-prosewrap — record `proseWrap: always` + width 80 rationale in
      docs (formatting.md/markdown.md); include the prettier-tables validation
      (byte-identical to deno fmt, 2026-06-28; spot-check alignment markers,
      very-wide tables, CJK width).
- [ ] dependency-update-doc — document the update workflow (`outdated:fix` =
      `bun update -i -r`); CAVEAT: verify `catalog:` reference handling. Revisit
      at the first stale dep.

## Closed (newest first)

One line per closed item — this section doubles as the `tickets - archive`
index. Prune old lines freely; git keeps everything.

- 2026-07-19 lab-routes-refined — `/lab` grew into list-first surfaces per
  pipeline artifact: Corpora (typed scan findings replacing server-log
  warnings + graded epub/vtt match quality), Audiobooks/Epub/VTT lists,
  Alignment (coverage metrics from cached artifacts + cache visibility/evict +
  standalone inspector), Locate (matched/all-token modes, report v2), all on a
  shared LabTable. The branch also carried the metadata-canonical-from-tags
  first stab (tags now canonical for title/author), the ISO 8601 date rule, and
  the delegation-doc updates.
  [plans/archive/lab-routes-refined.md](plans/archive/lab-routes-refined.md)
- 2026-07-19 document-delegation-tiers — standing delegation directive ("lower
  power model and effort in a subagent; account for it in planning") plus the
  proven `[tier: low|med]` scheme written into `docs/workflow.md`'s Plans
  section; AGENTS.md Execution pointer strengthened.

- 2026-07-18 bookplayer-audio-range-compat — exact browser ranges now use one
  Nitro/Bun-file audio path in development and production. Accepted with a
  50-book development burn-in (no OOM) and Brave/iPad ad-hoc playback.
- 2026-07-12 sync-repository-workflow — `docs/` renamed to lowercase kebab-case
  (reversed the earlier UPPERCASE decision; verified two-hop `git mv` procedure
  for macOS case-insensitive filesystems), all 20 referencing files fixed,
  `docs/workflow.md`'s casing statement corrected, `AGENTS.md`'s Execution
  section deduped to a pointer, the "one named quality gate per repo" invariant
  added. Nix-hardy commit `8516003` was the source; review comments delivered to
  Codex separately.
  [plans/archive/sync-repository-workflow.md](plans/archive/sync-repository-workflow.md)
- 2026-07-12 player-sync-core — route-level `usePlayerSync` (follow works with
  the panel closed), EPUB dblclick reverse sync (srcdoc CFI bridge; the raw path
  lookup could never work), reader chrome colocated with the EPUB pane, panel
  word gesture = single click seek+show, EpubReader hardened against epub.js
  display wedges (latest-wins scheduler, non-blocking init, detached section
  loads). [plans/archive/player-sync-core.md](plans/archive/player-sync-core.md)
- 2026-07-12 lab-routes — `/dev/*` -> `/lab/*` with tabbed layout + landing
  (Locate live; Align/Epub/Parsers reserved); data-plane renamed
  `/api/locate-sweep` + `<bookId>.locate-sweep.json`. Same plan.
- 2026-07-12 matching-quality-design — as-built baseline design doc accepted
  (P3.2); revisit when design docs are folded into docs/ (docs-taxonomy).
  [design/matching-quality-design.md](design/matching-quality-design.md)
- 2026-07-12 bookplayer-calibre-html-locate — RESOLVED by replacing the two
  Calibre `.html` books (Daniel); full corpus now 93/93 swept, 93 clean,
  11,554,769/11,554,769 tokens ok, 0 failed. The documentElement-anchoring fix
  drops to optional general robustness — revisit only if a new prolog-polluted
  book appears.

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
