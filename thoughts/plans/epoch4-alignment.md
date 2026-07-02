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
  Alignment outputs live under gitignored `data/align/`; regression history uses
  a nested LOCAL-ONLY git repo inside it (exemplar:
  `apps/epub-validate/reports/`); regeneration preserves the nested `.git`.
- `audio-deno-match` is historical context for possible later comparison, not an
  Epoch 4 implementation source.
- `apps/transcribe/scripts/tools/vtt-compare.ts` is context for a possible
  future VTT/VTT alignment capability, not an Epoch 4 implementation source.
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
  path. The Alice triplet enters through config/tests as explicit fixture paths
  — corpus discovery never sees `fixtures/`.
- Private evaluation defaults to every `data/transcribe/output/*.vtt` with an
  unambiguous basename match in the configured external audiobook corpus. The
  current local corpus root is `/Volumes/Space/Reading/audiobooks`;
  configuration supplies it rather than source code.

## 1 — Scaffold

- [ ] Scaffold `apps/align` (`@prosodio/align`): `package.json`, minimal
      runnable `align.ts` entry, one placeholder test; prove root `bun run ci`
      covers the new workspace.
- [ ] Expose `bun run align` from `apps/align/package.json` as the documented
      app invocation (mirrors epub-validate's `validate`); quality checks stay
      in the root `ci` target only.

## 2 — Config

- [ ] Add `apps/align/lib/config.ts` as the only source for paths and
      parameters, following `apps/transcribe/lib/config.ts` and
      `apps/epub-validate/src/config.ts`: repo-root anchoring; public
      `fixturesDir` plus the Alice triplet fixture paths; volatile `data/align/`
      output root; the transcription root (default `data/transcribe/output`);
      the external corpora root (the `/Volumes/Space/Reading/audiobooks` value
      lives here, never elsewhere in source); alignment pass parameters (Pass 1
      `k = 6`, proof pass `k = 4`, normalization policy id, extraction flags).

## 3 — Discovery and matching

Runnable before any alignment exists: `align --list` reports the matched set.

- [ ] Discover VTT files from the configured transcription root (`*.vtt`,
      non-recursive).
- [ ] Recursively index `.m4b` files under the configured external corpora root;
      pair VTT to M4B by exact basename; resolve the EPUB belonging to each
      matched audiobook from its corpus entry.
- [ ] Report unmatched, duplicate, and ambiguous VTT/M4B/EPUB candidates
      deterministically instead of choosing one silently.
- [ ] Add `-s, --search <terms>`: deterministic case-insensitive AND matching —
      split on whitespace, require every term in the combined relative corpus
      path and basename. Search filters the already-matched set; it never
      changes pairing. Follow `do-series.sh` syntax/help/summary style without
      its required-search or interactive-selection behavior.
- [ ] Add `--list` to print the matched triplets and exclusions without
      aligning; cover discovery/matching/search with unit tests on synthetic
      paths (no private corpus needed in CI).

## 4 — Contracts and sequence builders

Types and the three input builders, each with tests, before any matching.

- [ ] Freeze the strict Unicode-aware Pass 1 normalizer (NFKC, lowercase,
      `[^\p{L}\p{N}]+` boundaries) producing tokens AND the normalized-to-raw
      offset map in one pass so normalization cannot drift from addressing.
      Fixture tests: punctuation, apostrophes, hyphens, diacritics, numbers.
- [ ] Define the token-sequence and span contracts: opaque source positions,
      `EpubTextAddress` (spineIndex/spineHref + half-open normalized char
      range), accepted-span and residual-gap types with `passId`, parameters,
      and evidence.
- [ ] Build the VTT token sequence over `@prosodio/vtt`: flat word tokens with
      normalized/raw text, sequence offset, cue/word indices, monotonic time —
      direct when provenance says `wordTimestamps: true`, else interpolated
      `start + (end - start) * i / n`; record timing provenance. Test against
      the Alice fixture VTT (interpolation path).
- [ ] Build EPUB extraction: open the EPUB (assumption above), traverse content
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

- [ ] Implement the pass framework: passes receive immutable sequences,
      already-accepted spans, and residual gaps; they emit candidates with
      evidence; a shared reconciliation step enforces bounds, monotonicity, and
      non-overlap before accepting spans.
- [ ] Pass 1 candidate generation: sliding `k = 6` n-grams over both complete
      token streams; keep keys unique in both; intersect to
      `(vttOffset, epubOffset)` candidates; verify token arrays on every hash
      hit.
- [ ] Monotonic selection: LIS over epubOffset in vttOffset order (O(M log M)).
- [ ] Coalesce same-diagonal overlapping/adjacent n-grams into exact spans;
      extend outward while normalized tokens match, bounded by neighboring
      spans; merge spans whose extensions meet with no mismatch.
- [ ] Metrics: candidate/accepted counts and survival rate per pass; VTT and
      EPUB matched-token coverage; gross per-spine word/match/anchor stats
      (zero-match documents included, never silently excluded); gap
      distributions (VTT words, EPUB words, time); rolling anchor density; local
      WPM and word-ratio anomalies; deterministic zero/low-match warnings.
- [ ] Alice end-to-end integration test on the committed triplet: pipeline runs,
      spans are ordered/in-bounds/non-overlapping, and repeated runs are
      byte-identical.

## 6 — Run wiring and private reports

- [ ] Wire `bun run align`: default processes every unambiguous private-corpus
      match; `-s` filters; results and a run summary go under `data/align/`.
- [ ] Create the private results dir as a nested LOCAL-ONLY git repo inside
      gitignored `data/align/` (per docs/PRIVACY.md); regeneration deletes stale
      generated files but preserves the nested `.git`.

## 7 — Multipass proof

- [ ] Represent accepted spans and residual gaps so a weaker pass can only add
      spans inside gaps bounded by stronger anchors — never move, replace, or
      cross them (enforced by the shared reconciliation).
- [ ] Run a smaller exact n-gram pass, initially `k = 4`, with uniqueness and
      LIS scoped independently to each residual gap; label every new span with
      its pass and parameters.
- [ ] Prove on at least one evaluation book (Alice qualifies) that the weaker
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
      corpus); keep the report private in `data/align/`.
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
  Pass 1; private-output home fixed as `data/align/` with the nested local-only
  git pattern. Status -> active; branch `epoch4`.
