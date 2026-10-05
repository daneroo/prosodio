# BACKLOG

Idea inbox, grouped by theme: snippets worth not forgetting, not yet worth an
issue. Promote to a GitHub issue, then delete the line. Rules:
[docs/workflow.md](../docs/workflow.md).

## player-ux

- [ ] retire-transcript-panel — the alignment panel is a superset of the
      transcript panel; retire the transcript panel. Catch: a book with a VTT
      but no EPUB has no alignment panel, so the alignment panel must first
      render cues without an ebook side. May need refactoring.
- [ ] link-toggle-placement — the link toggle (ebook panel ↔ audio position)
      does not belong in the top bar; find it a home. Icon and rename land with
      follow mode v1 (#10).
- [ ] bookplayer-epub-teardown-race — rapid hard navigation can tear down
      epub.js while async `Rendition.start`/`replaceCss` work is still running,
      emitting warnings. Separate from the resolved OOM and locate-sweep console
      noise.
- [ ] bookplayer-ebook-renderer — keep the EPUB renderer swappable; evaluate
      epub.js alternatives when search/highlight or theming becomes a real
      limitation. Why: epub.js 0.3.x is old and weakly typed (search/highlight
      sank the codex experiment; it logs caught `IndexSizeError`s on some
      relocations). The isolation is in place: the whole epub.js surface sits in
      `EpubReader.tsx` behind `ReaderController`. Candidates: readium
      (`@readium`), foliate-js, or a custom paginator over the spine text
      `packages/align` already extracts.
- [ ] bookplayer-serve-vtt-track — serve the VTT to the media element
      (`<track>`); kept open by design D9. Revisit when native captions become a
      real want.
- [ ] bookplayer-media-chrome — consider Media-Chrome web components
      ([react version](https://www.media-chrome.org/docs/en/react/get-started)).
- [ ] prosodio-logo — redraw the logo as custom SVG paths. Prototype (font
      glyphs, abandoned): ai-garden repo,
      `bun-one/apps/vite-one/src/pages/Logo.tsx` (`/logo` route; commits
      `04565a267`..`1e6bf2ac8`, 2026-01-18): Hero, SM and MD variants. Pick: SM
      SVG-0 (¶ with sound waves radiating out = prose + audio). Needs per-size
      drawings (≤16 px simplified, heavier strokes, pixel-snapped), and spacing
      between the ¶ and the waves set by eye at each size; MD (staff with
      glyphs) only for large sizes, if at all.

## alignment quality

- [ ] alignment-evaluation — aggregate quality scores for alignment, to compare
      matcher implementations and word- vs phrase-timed VTTs. Today's metrics
      (`vttCoverage`, `anchorDensity`, `anomalies`, …; baseline in
      `thoughts/design/matching-quality-design.md`) measure coverage, not
      correctness; manual `reviewSamples` reading doesn't scale to ~700 books.
      Precision seeds needing no ground truth: diagonal consistency of spans,
      time-monotonicity outliers, WPM anomalies, cross-edition agreement.
      Becomes an issue (or a `/wayfinder` map) when alignment algorithm work
      starts.
- [ ] locate-sweep-epubjs-console-noise — epub.js emits internal `substitute`
      TypeErrors during the sweep's renderless `section.load`; cosmetic, results
      unaffected, low priority.

## corpus validation

Charter: [docs/corpora/validation.md](../docs/corpora/validation.md) — one core,
CLI + web skins, three corpora; milestones bootstrap -> nx-audiobook parity ->
vtt/alignment.

- [ ] validate-fix-apply — the gated repair step (charter Scope: Reconciliation
      convention, desired -> actual). Candidates: .DS_Store removal, perms
      chmod, xattr strip, apply-hints (touch corpus mtimes to the DB),
      `--record-mtimes` per-entry confirmation, hints-file normalization
      (Daniel: "the rewrite/fix phase"). Each fix explicitly gated/confirmed;
      kin to #9 (`sanity-reconcilers`). Also the home of the repair halves of #2
      (stts `setts` rebuild) and #3 (Calibre bookmark strip).
- [ ] validate-cli-ux — progress + verbosity for validate-cli (Daniel
      2026-07-20): consider opentui for the probe pass progress (~30s on
      private, currently silent); `-v`/`-vv` verbosity tiers (nx precedent:
      quiet default, failures-only, everything); decide how `--json` respects
      verbosity (finding filtering vs always-complete).

## corpus quality

- [ ] book-metadata-identity — possibly use canonical metadata as the bookId
      (suffixed with a short sha digest, 5-7 hex). Gate CLEARED 2026-07-19:
      `metadata-canonical-from-tags` closed, tag reliability proven (952/952
      source=tags). Big blast radius (alignment artifact cache keys,
      locate-sweep reports, localStorage progress, URLs) and a digest-input
      decision (basename = rename-fragile; file content = rename-stable but
      reads every m4b). Needs its own design + migration story before code.
- [ ] corpora-omnibus-mapping — some EPUBs are omnibus editions mapping to MANY
      audiobooks (Neal Stephenson, Baroque Cycle: the "Quicksilver" audiobook
      dir contains an epub covering volumes 01-02-03; other series omnibuses
      known). Discovery/pairing assumes 1:1 — decide how to represent
      1-epub:N-audiobooks (and the alignment window per audiobook: each book
      would match a SUB-RANGE of the epub, breaking the whole-book linearity
      assumption). Relates: `align-soft-basename-match`, #6
      (`known-mismatch-naming`), and the matching-quality content-qualification
      direction.
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
- [ ] epub-dangling-asset-refs — EPUB content referencing resources absent from
      the package: Adobe `res:///` fonts (Discworld 05, 16, 19) and stylesheets
      missing from the zip (Komarr `komarr.css`, The First Law 03 `Style.css`).
      Harmless reader console noise (burn-in 2026-10-02: 23 errors across 5
      books). Detectable statically by resolving XHTML/CSS hrefs against the
      zip, no browser needed: an epub-validation candidate.

## infra

- [ ] bookplayer-runtime-parity — make the built Bookplayer serve every route,
      including alignment; pass burn-in and iPad ad-hoc checks in development
      and production, explicitly exercising Node and Bun execution rather than
      assuming `bun run` selects the runtime. A prerequisite for the container
      deployment in #7.
- [ ] align-cli-rename — rename `apps/align/` to match its CLI-only role (npm
      name already `@prosodio/align-cli`); must ship with a full reference
      sweep. Revisit when align-cli gets real work.
- [ ] align-cli-zod-ci — `bun run ci` fails on a fresh install:
      `apps/align/lib/report.ts` (align-cli, the CLI over `packages/align`)
      imports `zod`, which `apps/align/package.json` doesn't declare. It passes
      in an existing checkout only through a leftover `node_modules/zod` link.
      zod and valibot are both in the root `runtime` catalog.
- [ ] dependency-refresh — run `bun run outdated` and update; pair with
      `dependency-update-doc`. Bump root `markdownlint` with `markdownlint-cli2`
      (exact pin; see `.markdownlint-cli2.jsonc`).
- [ ] agents-md-convention — settled for Claude Code (2026-10-02): `AGENTS.md`
      is canonical and `CLAUDE.md` is a one-line `@AGENTS.md` import
      ([docs](https://code.claude.com/docs/en/memory#agents-md)). Native
      `AGENTS.md` reading is off while a `CLAUDE.md` sits above the repo (now:
      ai-garden), so the import stays until prosodio moves out; then it can be
      deleted. Remaining: `.cursor/rules` precedence, if Cursor is ever used
      here.
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
      baseline when it is digested and simplified into docs/). First piece
      queued: #12 adds `docs/bookplayer/lab.md` (the lab design rules D1–D10,
      harvested from the deleted `lab-routes-refined` plan).
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
- [ ] spelunk-closed-history — if pre-GitHub completed work is ever needed,
      recover the dropped `## Closed` log (2026-07-19..2026-09-27):
      `git show 6b0213e~1:thoughts/BACKLOG.md`; links point into
      `thoughts/plans/archive/`.
