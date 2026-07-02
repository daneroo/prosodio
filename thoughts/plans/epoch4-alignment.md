# epoch4-alignment — Sparse VTT–EPUB alignment

Status: active

Goal: produce and evaluate sparse, high-confidence VTT–EPUB anchors while
proving that weaker passes can safely fill residual gaps.

Canonical design:
[`epoch4-alignment-design.md`](../design/epoch4-alignment-design.md). The design
is the source of truth for the algorithm; this plan orders it into executable
increments.

## Context and decisions

- Epoch 4 ends with evaluated sparse anchors, not a complete word alignment.
- The architecture must support ordered later passes. A proof pass using a
  smaller n-gram inside residual gaps is part of the desired evidence.
- `wordTimestamps: true` is not required. When absent, interpolate word times
  within each cue; timing preserves order but does not decide textual matches.
- EPUB positions use `spineIndex`/`spineHref` plus a normalized character range.
  The matcher sees that position as opaque.
- Start with conservative EPUB extraction. `linear="no"` and similar semantic
  exclusions are recorded configuration because real spine metadata may be
  unreliable.
- ASSUMPTION (flagged, not settled): EPUB text extraction opens books with
  `@likecoin/epub-ts` on the node path — the parser pairing epoch 2 proved over
  all 756 private books (LinkeDOM with jsdom fallback; see
  `apps/epub-validate/src/epubts-node.ts`). Extraction stays app-local to
  `apps/align`; `ParserOutput` carries no text, so this is fresh code, not reuse
  of epub-validate.
- `apps/align` is the runnable workspace boundary. Matching logic may be
  extracted later only when a real second consumer justifies a package.
- Anything derived from the private corpus is private (docs/PRIVACY.md).
  Alignment outputs live under gitignored `apps/align/reports/`; regression
  history uses a nested LOCAL-ONLY git repo inside it (exemplar:
  `apps/epub-validate/reports/`); regeneration preserves the nested `.git`.
- All VTT reading/parsing goes through `@prosodio/vtt`
  (`"@prosodio/vtt": "workspace:*"`), never ad-hoc parsing.
- `audio-deno-match` is historical context for possible later comparison, not an
  Epoch 4 implementation source.
- `apps/transcribe/scripts/tools/vtt-compare.ts` is context for a possible
  future VTT/VTT alignment capability, not an Epoch 4 implementation source.
- `scripts/match-vtt.sh` (repo root) is the working reference for triplet
  discovery: named root sets pairing a flat transcriptions dir with a nested
  corpora dir (`fixtures`: `fixtures/transcriptions` + `fixtures/audiobooks`;
  `private`: `data/transcribe/output` + the external corpora root); `.m4b` files
  indexed by basename; the EPUB resolved as the m4b's same-basename sibling;
  `-s` AND filter; `-r all|fixtures|private` root selector.
- `apps/transcribe/scripts/many/do-series.sh` is the usage reference for `-s`
  multi-term, case-insensitive AND filtering over audiobook paths. Unlike that
  interactive transcription script, `align` makes search optional and defaults
  to all matched books.
- `chapter-marks-match`, viewer/CFI work, player, finder, TTS, and content
  search are context for later capabilities, not Epoch 4 work.

## Evaluation inputs

- Public baseline: Alice's Adventures in Wonderland EPUB plus the
  manifest-fetched M4B under `fixtures/audiobooks/`.
- The Alice VTT is committed under `fixtures/transcriptions/`. Its provenance
  uses basenames and `wordTimestamps: false`, so it exercises the interpolation
  path. The Alice triplet is discovered via the `fixtures` root; the committed
  end-to-end integration test feeds the VTT + EPUB paths directly (no m4b needed
  to align, so CI works without the gitignored fetched m4b).
- Private evaluation defaults to every `data/transcribe/output/*.vtt` with an
  unambiguous basename match in the configured external audiobook corpus. The
  current local corpus root is `/Volumes/Space/Reading/audiobooks`;
  configuration supplies it rather than source code.

## 1 — Scaffold

- [x] Scaffold `apps/align` (`@prosodio/align`): `package.json` declaring
      `@prosodio/vtt` (`workspace:*`), minimal runnable `align.ts` entry, one
      placeholder test; root `bun run ci` covers the new workspace (222 tests /
      22 files, up from 221/21).
- [x] Expose `bun run align` from `apps/align/package.json` as the documented
      app invocation (mirrors epub-validate's `validate`); quality checks stay
      in the root `ci` target only. Smoke-ran from `apps/align/`.

## 2 — Config

- [x] Add `apps/align/lib/config.ts` as the only source for paths and
      parameters, following `apps/transcribe/lib/config.ts` and
      `apps/epub-validate/src/config.ts`: repo-root anchoring; public
      `fixturesDir` plus the Alice triplet fixture paths; app-local gitignored
      `apps/align/reports/` output root (`reportsDir`, mirroring epub-validate);
      named root sets pairing transcriptions + corpora dirs (`fixtures`,
      `private` — the `/Volumes/Space/Reading/audiobooks` value lives here,
      never elsewhere in source; cf. epub-validate's `roots`); alignment pass
      parameters (Pass 1 `k = 6`, proof pass `k = 4`, normalization policy id,
      extraction flags).

## 3 — Discovery and matching

Runnable before any alignment exists: `align --list` reports the matched set.
Reference implementation: `scripts/match-vtt.sh`.

- [x] Discover triplets per configured root set: flat `*.vtt` scan of the root's
      transcriptions dir; recursive `.m4b` index of its corpora dir keyed by
      basename; exact-basename VTT->M4B pairing; EPUB resolved as the m4b's
      same-basename sibling. Missing roots skip with a warning (the private
      corpus is not always mounted).
- [x] Report unmatched, duplicate, and ambiguous VTT/M4B/EPUB candidates
      deterministically instead of choosing one silently (match-vtt.sh's matched
      / no-epub / no-m4b buckets, plus duplicate-basename detection).
- [x] Add `-s, --search <terms>`: deterministic case-insensitive AND matching —
      split on whitespace, require every term in the combined relative corpus
      path and basename. Search filters the already-matched set; it never
      changes pairing. Follow match-vtt.sh/do-series.sh syntax and summary style
      without do-series's required-search or interactive selection.
- [x] Add `--list` (plus a `-r <root>` selector, default all roots) to print
      matched triplets and exclusions without aligning; cover
      discovery/matching/search with unit tests on synthetic paths (no private
      corpus needed in CI).

## 4 — Contracts and sequence builders

Types and the three input builders, each with tests, before any matching.

- [x] Freeze the strict Unicode-aware Pass 1 normalizer (NFKC, lowercase,
      `[^\p{L}\p{N}]+` boundaries) producing tokens AND the normalized-to-raw
      offset map in one pass so normalization cannot drift from addressing.
      Fixture tests: punctuation, apostrophes, hyphens, diacritics, numbers.
- [x] Define the token-sequence and span contracts: opaque source positions,
      `EpubTextAddress` (spineIndex/spineHref + half-open normalized char
      range), accepted-span and residual-gap types with `passId`, parameters,
      and evidence.
- [x] Build the VTT token sequence over `@prosodio/vtt`: flat word tokens with
      normalized/raw text, sequence offset, cue/word indices, monotonic time —
      direct when provenance says `wordTimestamps: true`, else interpolated
      `start + (end - start) * i / n`; record timing provenance. Test against
      the Alice fixture VTT (interpolation path).
- [x] Build EPUB extraction: open the EPUB (assumption above), traverse content
      documents in spine order, walk text in document order, exclude only
      `head`/`script`/`style` in the baseline, emit per-spine-document
      normalized text, offset map, and token sequence via the same normalizer;
      record extraction flags (`linear="no"` included in the baseline, as
      recorded configuration). Test against the committed Alice EPUB.
- [ ] Define the sparse result schema: VTT/EPUB provenance, normalization and
      extraction config echo, ordered spans (VTT offset range, EPUB offset
      range, resolved `EpubTextAddress`, approximate time range, pass evidence),
      residual gaps, metrics, warnings. Deterministic serialization (no
      wall-clock values).

## 5 — Pass framework and Pass 1

- [x] Implement the pass framework: passes receive immutable sequences,
      already-accepted spans, and residual gaps; they emit candidates with
      evidence; a shared reconciliation step enforces bounds, monotonicity, and
      non-overlap before accepting spans.
- [x] Pass 1 candidate generation: sliding `k = 6` n-grams over both complete
      token streams; keep keys unique in both; intersect to
      `(vttOffset, epubOffset)` candidates; verify token arrays on every hash
      hit.
- [x] Monotonic selection: LIS over epubOffset in vttOffset order (O(M log M)).
- [x] Coalesce same-diagonal overlapping/adjacent n-grams into exact spans;
      extend outward while normalized tokens match, bounded by neighboring
      spans; merge spans whose extensions meet with no mismatch.
- [x] Metrics: candidate/accepted counts and survival rate per pass; VTT and
      EPUB matched-token coverage; gross per-spine word/match/anchor stats
      (zero-match documents included, never silently excluded); gap
      distributions (VTT words, EPUB words, time); rolling anchor density; local
      WPM and word-ratio anomalies; deterministic zero/low-match warnings.
- [x] Alice end-to-end integration test on the committed triplet: pipeline runs,
      spans are ordered/in-bounds/non-overlapping, and repeated runs are
      byte-identical.

## 6 — Run wiring and private reports

- [ ] Wire `bun run align`: default processes every unambiguous match across all
      configured roots (missing roots skip); `-s`/`-r` filter; results and a run
      summary go under `apps/align/reports/`.
- [ ] Create the private results dir as a nested LOCAL-ONLY git repo inside
      gitignored `apps/align/reports/` (per docs/PRIVACY.md); regeneration
      deletes stale generated files but preserves the nested `.git`.

## 7 — Multipass proof

- [x] Represent accepted spans and residual gaps so a weaker pass can only add
      spans inside gaps bounded by stronger anchors — never move, replace, or
      cross them (enforced by the shared reconciliation).
- [x] Run a smaller exact n-gram pass, initially `k = 4`, with uniqueness and
      LIS scoped independently to each residual gap; label every new span with
      its pass and parameters.
- [x] Prove on at least one evaluation book (Alice qualifies) that the weaker
      pass adds correct spans in a real residual gap while preserving every Pass
      1 span byte-for-byte.

## 8 — Evaluation and acceptance

- [ ] Define the stratified manual anchor-review procedure (edge, interior,
      anomaly-adjacent samples; at least one span per matched book) and record
      reason codes for failures and excluded content; emit explicit review
      worklists for zero-match spine items and anomalous gaps.
- [ ] Capture a baseline with both `linear="no"` settings before choosing a
      default from corpus evidence.
- [ ] Full private-corpus run and review (Daniel — needs the mounted external
      corpus); keep the report private in `apps/align/reports/`.
- [ ] Record acceptance evidence: determinism, structural correctness, Pass 1
      precision (no known false anchor in the high-confidence sample), multipass
      safety; coverage reported without a pre-baseline minimum.
- [ ] Remove `apps/transcribe/scripts/tools/vtt-monotonicity.ts` because
      `@prosodio/vtt` owns that check; leave `vtt-compare.ts` in place as future
      VTT/VTT context.
- [ ] Root `bun run ci` green; record evaluation commands and evidence; close
      the epoch without expanding into dense alignment or viewer work.

## Progress log

Append-only; newest at the bottom. Each entry: date, step, command/commit.

- 2026-07-02 — Plan reshaped for executability against the design: sections
  reordered by dependency (scaffold -> config -> discovery -> contracts -> Pass
  1 -> wiring -> proof -> acceptance); EPUB text extraction made an explicit
  build step (ParserOutput carries no text; epoch 2 deferred the abstraction
  here) with the epub-ts node-path assumption flagged; run wiring moved after
  Pass 1; private-output home first set as `data/align/` with the nested
  local-only git pattern. Status -> active; branch `epoch4`.
- 2026-07-02 — Daniel's corrections folded in: private outputs live app-local at
  gitignored `apps/align/reports/` (the epub-validate exemplar), not
  `data/align/`; `@prosodio/vtt` (`workspace:*`) is the declared VTT engine.
  Autonomy granted: commit and proceed per step unless his judgement is truly
  needed.
- 2026-07-02 — Discovery model corrected to Daniel's `scripts/match-vtt.sh`
  demonstrator: named root sets (`fixtures`, `private`) each pairing a flat
  transcriptions dir with a nested corpora dir; EPUB = the m4b's same-basename
  sibling; `-r` root selector added; Alice is discovered via the `fixtures` root
  (the integration test still feeds VTT+EPUB directly — no m4b needed to align).
- 2026-07-02 — Sections 1-3 landed (`26cbd32`, `81e8d4f`, `ad8dec4`): scaffold,
  config, discovery + `-s`/`-r`/`--list`. Live discovery verified on both roots;
  the private root surfaces real case-mismatch epub exclusions (reported, not
  guessed). Section 4 in progress: normalizer (`d5e6c31`, with
  reference-pipeline equivalence guard), contracts + VTT sequence (`5a3d0b0`).
  EPUB extraction deviation from the flagged assumption: jsdom ALWAYS,
  in-process (no LinkeDOM-first hybrid, no subprocess kill harness — jsdom opens
  every book LinkeDOM hangs on, BACKLOG epubts-node-jsdom-always); epub-ts/jsdom
  hoisted to the root runtime catalog (2nd consumer rule). FINDING: the
  committed Alice EPUB (#19033) is an abridged illustrated retelling (~13.3k
  tokens) while the LibriVox narration reads the full #11 text (~27k words) —
  the public fixture is deliberately a hard alignment case, not a happy path;
  anchor coverage expectations must account for it.
- 2026-07-02 — Sections 4-5 landed: normalizer, contracts, VTT sequence, EPUB
  extraction, LIS, exact pass (k-parameterized, window-scoped for gap reuse),
  shared reconciliation + gaps, metrics, Alice end-to-end test. BUG found by the
  reconcile gate on real data then fixed in the pass: consecutive spans on
  different diagonals can overlap by up to k-1 tokens after LIS; trimOverlaps
  now trims the later span's start on both axes. Alice Pass 1: 7,108 candidates,
  survival 0.9994, 385 spans, coverage VTT 0.331 / EPUB 0.684, 0 rejections,
  deterministic across runs. Serialized result schema deferred to section 6
  (design: just-in-time for its first consumer).
- 2026-07-02 — Section 7 (multipass proof) landed ahead of section 6 so the
  serialized reports capture the final two-pass span set. alignBook now runs the
  k=4 gap-scoped proof pass through the same reconciliation gate
  (`proofPass: false` opts out for the safety comparison). Alice proof: 84
  gap-scoped candidates, survival 0.988, 55 added spans, coverage VTT 0.331 ->
  0.340 / EPUB 0.684 -> 0.703; every Pass 1 span byte-identical; all added spans
  inside Pass 1 gaps, exact matches, combined set monotonic.
