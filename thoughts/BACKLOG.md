# BACKLOG

Idea inbox, grouped by theme: snippets worth not forgetting, not yet worth an
issue. Promote to a GitHub issue, then delete the line. Rules:
[docs/workflow.md](../docs/workflow.md). `ticket:` links are legacy notes in
[tickets/](tickets/); add no new ones.

## player-ux

- [ ] bookplayer-abs-remote-follow — preliminary design for an optional
      read-only transport: ABS owns phone/car audio and position; Bookplayer
      follows the aligned EPUB without playing audio. The Socket.IO subscription
      and active-book switch are proven; design stale/pause behavior, identity
      mapping, token custody, and production parity before implementation.
      ticket:
      [bookplayer-abs-remote-follow](tickets/bookplayer-abs-remote-follow.md)
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

- [ ] align-precision-at-scale — automated precision signal over the corpus;
      manual `reviewSamples` reading does not scale to ~700 books. ticket:
      [align-precision-at-scale](tickets/align-precision-at-scale.md)
- [ ] locate-sweep-epubjs-console-noise — epub.js emits internal `substitute`
      TypeErrors during the sweep's renderless `section.load`; cosmetic, results
      unaffected, low priority.

## corpus validation

Charter: [docs/corpora/validation.md](../docs/corpora/validation.md) — one core,
CLI + web skins, three corpora; milestones bootstrap -> nx-audiobook parity ->
vtt/alignment.

- [ ] epub-calibre-pollution-audit — Calibre bookmark files silently change epub
      sha256 (141 + 167 flagged 2026-07-03); decide strip/prevent/CI-gate — a
      validation rule in waiting. ticket:
      [epub-calibre-pollution-audit](tickets/epub-calibre-pollution-audit.md)
- [ ] audio-stts-timeline-audit — detect m4bs whose `stts` sample table
      under-reports packet durations (Diamond Age: seeking drifts ~13 s per
      source-part join, playing straight through is fine). A cheap header check
      (`nb_frames × 1024 / rate` vs duration) works as a corpus scan or a
      validate-cli rule. ticket:
      [audio-stts-timeline-audit](tickets/audio-stts-timeline-audit.md)
- [ ] validate-fix-apply — the gated repair step (charter Scope: Reconciliation
      convention, desired -> actual). Candidates: .DS_Store removal, perms
      chmod, xattr strip, apply-hints (touch corpus mtimes to the DB),
      `--record-mtimes` per-entry confirmation, hints-file normalization
      (Daniel: "the rewrite/fix phase"). Each fix explicitly gated/confirmed;
      kin to `sanity-reconcilers`.
- [ ] validate-cli-ux — progress + verbosity for validate-cli (Daniel
      2026-07-20): consider opentui for the probe pass progress (~30s on
      private, currently silent); `-v`/`-vv` verbosity tiers (nx precedent:
      quiet default, failures-only, everything); decide how `--json` respects
      verbosity (finding filtering vs always-complete).
- [ ] align-known-mismatch-convention — validation exceptions/expectations:
      declared deviations (file-naming keyword cues like `Omnibus`, `reference`,
      `abridged`) so a legitimately non-faithful pair reads as acknowledged, not
      failed. Exemplar: abridged Alice; private Alice as the practice specimen.
      ticket:
      [align-known-mismatch-convention](tickets/align-known-mismatch-convention.md)

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
      assumption). Relates: `align-soft-basename-match`,
      `align-known-mismatch-convention`, and the matching-quality
      content-qualification direction.
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

## infra

- [ ] bookplayer-runtime-parity — make the built Bookplayer serve every route,
      including alignment; pass burn-in and iPad ad-hoc checks in development
      and production, explicitly exercising Node and Bun execution rather than
      assuming `bun run` selects the runtime.
- [ ] promote-app-config — PARTIALLY LANDED via validate-bootstrap S0
      (2026-07-19): `packages/config` exists (named-root model; bookplayer +
      validate-cli consume it). REMAINING: migrate transcribe/align/
      epub-validate and fold in their loose per-app values; the
      `CORPORA_DIR`/`DATA_DIR` overrides. ticket:
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
      Sprawl now hurts: style/lint config is split across .prettierignore,
      eslint.config.js, .markdownlint-cli2.jsonc, package.json scripts and
      docs/formatting.md, each with its own ignore list. Discuss with goal 2.
- [ ] dependency-refresh — run `bun run outdated` and update; pair with
      `dependency-update-doc`. Bump root `markdownlint` with `markdownlint-cli2`
      (exact pin; see `.markdownlint-cli2.jsonc`).
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
- [ ] spelunk-closed-history — if pre-GitHub completed work is ever needed,
      recover the dropped `## Closed` log (2026-07-19..2026-09-27):
      `git show 6b0213e~1:thoughts/BACKLOG.md`; links point into
      `thoughts/plans/archive/`.
