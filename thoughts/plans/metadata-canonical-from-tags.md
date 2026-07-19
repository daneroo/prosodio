# metadata-canonical-from-tags — m4b tags are the truth, not the basename

Status: partially landed — a first-stab correction (invert priority +
title/author only + cache bump + doc) shipped on `lab-routes-refined`; the
remainder (series/narrator model, dedicated extractor, finding-on-fallback)
stays for a full pass after merge.

First stab (committed): `library.ts` enrich now takes title/author from the m4b
tags canonically, basename only as a per-field fallback; `BookCache` version
bumped 2 -> 3 to force a re-probe; `docs/corpora/metadata.md` documents the
truth hierarchy and the fixtures' sorry state, pointing here. Deliberately NOT
in the first stab: series[] (needs the corpora-validation thinking — Daniel),
narrator, the `metadata-basename-fallback` finding, and the dedicated
`src/lib/metadata.ts` extractor. Those are S1/S3/S4 below, minus what the first
stab already did.

Goal: make the curated m4b ffprobe tags the canonical source for
title/author/series/narrator, with the basename as a flagged fallback used only
when the title tag is absent. Isolate extraction in one dedicated function, add
series (multi) and narrator as first-class fields, and document the truth
hierarchy.

## Why (the bug)

`library.ts` enrich currently overrides title/author from tags ONLY when the
basename yielded no author (`book.metadata.author === null`) — basename-first,
tags as gap-filler. The comment justifies this from ONE pathological fixture
(Alice's title tag `AliceWonderland8_librivox`). That is backwards.

Evidence (2026-07-19, full private corpus, `ffprobe -show_format`):

- `title` 952/952, `artist` 952/952 — **100% clean**; basename fallback fires on
  zero curated books.
- `album_artist` 949/952, `composer` (narrator) 936/952, `grouping` (series)
  224/952 (23%).
- Fixtures are worst-case demonstrators, not representative: `jfk.m4b` all tags
  null; both Alice m4bs carry title `AliceWonderland8_librivox`.

Series grammar (from `grouping`): semicolon-separated parts, each
`<name> #<position>` with the position optional; names may contain `:`;
MULTI-series is real (`Discworld #34; Discworld: Ankh-Morpork City Watch #7`).
Positions can be fractional (novellas, e.g. `#3.5`). Some values are genre junk
(`Adult`, `Canons`) — parsed as name-only series, acceptable noise the
Corpora/Audiobooks surfaces make visible.

## Dispatch policy

Per `docs/workflow.md` (standing delegation directive): judge each task,
delegate the spec-able ones to a lower-power subagent, do trivial wiring
directly; sequential, one commit per task, `bun run ci` green before each.

## Decisions

- D1 — truth hierarchy: `title` <- `title` tag; `author` <-
  `artist ?? album_artist`; `series[]` <- `grouping`; `narrator` <- `composer`.
  Basename parse (`parseBasename`) is fallback ONLY when the title tag is
  absent.
- D2 — a basename fallback is a data defect, not normal: emit a finding
  (`metadata-basename-fallback`, reusing the S2 findings channel) so it shows on
  the Corpora tab. Zero on the curated corpus today; catches uncurated
  additions.
- D3 — one dedicated pure extractor (`src/lib/metadata.ts`,
  `extractMetadata(probe, basename)`), separately testable, with a
  `parseGrouping` helper. `scan.ts`/`library.ts` call it; nobody else
  re-interprets tags.
- D4 — model grows: `BookMetadata` gains
  `series: Array<{ name: string; position: number | null }>` and
  `narrator: string | null`. `ProbeResult` exposes the raw `grouping` and
  `composer` tags (title/artist already there).
- D5 — cache invalidation: `BookCache` version bump forces a full re-probe, so
  every book re-extracts canonical metadata (an unchanged fingerprint would
  otherwise keep old basename-derived values via `carryOverMetadata`). Same
  intentional one-time invalidation pattern as lab-routes-refined S2.
- D6 — extraction still happens during async `enrich` (it needs ffprobe): scan
  seeds provisional basename values, enrich replaces them from tags when the
  title tag is present and appends the D2 finding when it is not, then the
  existing end-of-enrich `persistCache` writes findings + metadata together.
- D7 — consumers are read-only and unaffected (home, browse sort/search, all lab
  tabs read `metadata.title/author`); they just get better data. New fields
  surface in the Audiobooks tab.

## Steps

### S1 — model + dedicated extractor + ffprobe surface [tier: med]

- [ ] `types.ts`: `BookMetadata` gains `series`/`narrator` (D4); add
      `BookSeries`.
- [ ] `ffprobe.ts`: `ProbeResult` exposes raw `grouping`/`composer` (keep
      `titleTag`/`artistTag`); update the `.title override` comment — tags are
      canonical now, not an override.
- [ ] New `src/lib/metadata.ts`: `extractMetadata(probe, basename)` (tags first,
      basename fallback only when title tag absent, returning a
      `usedBasenameFallback` signal for D2) + `parseGrouping` (semicolon split;
      trailing `#<pos>` incl. fractional; name-only when no `#`).
- [ ] `metadata.test.ts`: parseGrouping (single, multi, no-position, fractional,
      junk `Adult`); extractMetadata (clean tags win; missing title ->
      basename + fallback flag; author from album_artist when artist absent).
- Acceptance: pure-unit, no I/O; multi-series
  `Discworld #34; Discworld: Ankh-Morpork City Watch #7` round-trips to two
  entries with positions 34/7.

### S2 — wire into the library lifecycle [tier: med]

- [ ] `scan.ts`: seed provisional metadata (basename) but stop treating it as
      truth; `series: []`, `narrator: null` initial.
- [ ] `library.ts` enrich: call `extractMetadata`, replace
      title/author/series/narrator from tags when the title tag is present; when
      absent, keep basename values AND append a `metadata-basename-fallback`
      finding to the index before the final persist (D2/D6). Bump `BookCache`
      version (D5).
- [ ] Tests: inverted priority (tags win over a structured basename — the
      library.test.ts:234 case flips); finding emitted when title tag missing;
      v-old cache on disk triggers full re-probe.
- Acceptance: on the private root, a book with `Author - Title` basename AND
  differing tags shows the TAG values; findings count stays 0 (all curated books
  have title tags); fixtures Alice now shows its junk tag title (see S5).

### S3 — surface series/narrator [tier: low]

- [ ] Extend the lab row projections (`server/library.ts` `ScanReportBookRow`,
      `BookRow`) with series/narrator.
- [ ] Audiobooks tab: show narrator; render series as `Name #pos` chips
      (multiple), in the row or its chevron detail (LabTable).
- Acceptance: Discworld books show both series with positions; standalones show
  none; renders through the shared lab components.

### S4 — docs/corpora/ [tier: low]

- [ ] `docs/corpora/README.md` + `metadata.md`: the truth hierarchy (tags
      canonical, basename fallback = defect), the `grouping` grammar with the
      multi-series example, the corpus prevalence numbers, and the fixtures'
      sorry state (jfk all-null, Alice junk title) as the cautionary tale of why
      the original code was wrong.
- [ ] Index the new dir in `docs/README.md`.
- Acceptance: `bun run ci` (markdownlint) green; a reader learns why tags win
  and why the fixtures mislead.

### S5 — fixtures decision (open) [tier: low]

- [ ] Post-change the fixture Alice displays its junk title tag
      (`AliceWonderland8_librivox`) because the tag IS present, just semantic
      garbage — the code cannot know. Decide: re-tag the committed fixture m4bs
      with clean title/author (changes their sha/fingerprint, triggers re-probe;
      bookId is basename-derived so it is unaffected) vs. accept the junk
      display as an honest demonstration. Recommend re-tagging — it also helps
      `align-better-fixture-pair`. Daniel's call.

## Verification aids

Pointers for whoever executes the full pass (a fresh session need not re-derive
these):

- Finding discriminator books (to prove tags win over the basename): any book
  whose `title` tag differs from its basename-parsed title works — there is no
  single canonical example. As of 2026-07-19 the private corpus had ~146 such
  books; most differ by punctuation/casing the basename dropped (apostrophes,
  `&`, capitalization). Regenerate the set by diffing, per m4b,
  `ffprobe -show_format` `format.tags.title` against `parseBasename(basename)` —
  do not hardcode titles, the corpus changes.
- Driving the real corpus: `.claude/launch.json` (gitignored, local) defines
  `bookplayer-dev-private` on port 3002 (`BOOKPLAYER_ROOT=private`) and
  `bookplayer-dev-fixtures` on 3001. Metadata is only canonical after the
  background `enrich` probe completes, so allow a re-probe pass after a
  cache-version bump before reading titles.
- Why the cache bump is load-bearing (D5): `carryOverMetadata` reuses prior
  metadata for any unchanged m4b fingerprint, so without a `BookCache` version
  bump an already-cached book keeps its stale (basename) title and never
  re-probes. The first stab bumped 2 -> 3 for exactly this; any further
  metadata-shape change needs its own bump.

## Relates

- `book-metadata-identity` — blocked by this; tag reliability now proven (100%
  title+author), so the bookId-from-metadata idea has an evidence base.
- `merge-nx-audiobook-validation` — its file-mode/xattr checks emit findings
  through the same Corpora channel this uses for `metadata-basename-fallback`.
- `align-better-fixture-pair` — the fixtures are bad metadata test data too; S5
  overlaps.
- `corpora-omnibus-mapping` — series/position may inform omnibus detection
  later.
