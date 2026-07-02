# epoch4-alignment — Sparse VTT–EPUB alignment

Status: planned

Goal: produce and evaluate sparse, high-confidence VTT–EPUB anchors while
proving that weaker passes can safely fill residual gaps.

Canonical design:
[`epoch4-alignment-design.md`](../design/epoch4-alignment-design.md).

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
- `audio-deno-match` is historical context for possible later comparison, not an
  Epoch 4 implementation source.
- `apps/transcribe/scripts/tools/vtt-compare.ts` is context for a possible
  future VTT/VTT alignment capability, not an Epoch 4 implementation source.
- `apps/align` is the runnable workspace boundary. Matching logic may be
  extracted later only when a real second consumer justifies a package.
- `apps/align/package.json` exposes the app invocation as `bun run align`,
  mirroring `apps/epub-validate`'s `bun run validate` target.
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
  path.
- Private evaluation defaults to every `data/transcribe/output/*.vtt` with an
  unambiguous basename match in the configured external audiobook corpus.
  Discover external `.m4b` files recursively, then resolve the EPUB belonging to
  each matched audiobook. The current local corpus root is
  `/Volumes/Space/Reading/audiobooks`; configuration supplies it rather than
  source code. Keep derived reports private.
- `apps/align/lib/config.ts` is the single source for parameters and paths. It
  follows `apps/transcribe/lib/config.ts` and
  `apps/epub-validate/src/config.ts`, including repo-root anchoring and explicit
  public, volatile, and external roots.

## App and configuration

- [ ] Scaffold `apps/align` as a Bun workspace app/package with a minimal
      runnable entry point and root-CI coverage.
- [ ] Add an `align` script to `apps/align/package.json` as the documented app
      invocation target; keep quality checks in the root `bun run ci` target.
- [ ] Add `apps/align/lib/config.ts` as the only source for alignment defaults,
      tunable pass parameters, the public fixture root, volatile output and
      transcription roots, and the configurable external corpora root.
- [ ] Default transcription discovery to `data/transcribe/output/*.vtt`; allow
      the root to be overridden without embedding a machine path in source.
- [ ] Recursively index `.m4b` files under the configured external corpora root,
      match VTT and M4B basenames exactly, and locate the EPUB associated with
      each matched audiobook.
- [ ] Report unmatched, duplicate, and ambiguous VTT/M4B/EPUB candidates
      deterministically instead of choosing one silently.
- [ ] Make `bun run align` process every unambiguous private-corpus match by
      default; the Alice triplet remains the committed integration-test input.
- [ ] Add `-s, --search <terms>` to filter the already-matched set for targeted
      runs, e.g. `bun run align -s "culture banks"`.
- [ ] Define search as deterministic case-insensitive AND matching: split the
      query on whitespace and require every term in the combined relative corpus
      path and basename. Search filters matches; it never changes pairing.
- [ ] Match the `-s` syntax, help examples, and result-summary style established
      by `apps/transcribe/scripts/many/do-series.sh`, without inheriting its
      required-search or interactive-selection behavior.

## Design and contracts

- [x] Consolidate the two initial drafts into the canonical design; reject DOM
      paths/IDs, recursive bisection, automatic zero-match exclusions, and
      premature viewer design.
- [ ] Define the VTT token sequence contract, including optional interpolation
      and timing provenance.
- [ ] Define the EPUB extraction contract, normalized offset map, opaque
      address, and recorded extraction flags.
- [ ] Freeze the strict Unicode-aware Pass 1 normalization; add fixtures for
      punctuation, apostrophes, hyphens, diacritics, and numbers.
- [ ] Define the sparse result schema: provenance, accepted spans, pass
      evidence, residual gaps, metrics, and warnings.

## Evaluation preparation

- [x] Add the Alice VTT at
      `fixtures/transcriptions/Lewis Carroll - Alices Adventures in Wonderland.vtt`;
      it is byte-identical to the generated `data/transcribe/output/` source.
- [ ] Use the Alice EPUB/M4B/VTT triplet as the single committed end-to-end
      integration fixture; keep full-corpus runs local and private.
- [ ] Run the workflow across every unambiguous external VTT/M4B/EPUB match by
      default and keep its report private; use `--search` for focused reruns.
- [ ] Define a stratified manual anchor-review procedure and record reason codes
      for failures and excluded content.
- [ ] Capture a baseline with both `linear="no"` inclusion settings before
      choosing a default based on corpus evidence.

## Pass 1

- [ ] Generate exact `k = 6` n-grams unique in both complete token streams.
- [ ] Select the maximum-cardinality monotonic candidate chain using LIS.
- [ ] Coalesce overlapping candidates, extend exact matches within neighboring
      bounds, and emit ordered non-overlapping spans.
- [ ] Produce raw global, per-spine, gap, density, and anomaly metrics without
      silently excluding zero-match content.

## Multipass proof

- [ ] Represent accepted spans and residual gaps so later passes cannot alter or
      cross stronger anchors.
- [ ] Run a smaller exact n-gram pass, initially `k = 4`, with uniqueness and
      LIS scoped independently to each residual gap.
- [ ] Prove on at least one evaluation book that the weaker pass adds correct
      spans while preserving every Pass 1 span.

## Acceptance and cleanup

- [ ] Results are deterministic; all spans are in bounds, monotonic, and
      non-overlapping.
- [ ] Manual review finds no known false anchor in the Pass 1 high-confidence
      sample; coverage is reported but has no pre-baseline minimum.
- [ ] Alice and the selected private evaluation set produce explicit review
      worklists for zero-match spine items and anomalous gaps.
- [ ] Remove `vtt-monotonicity.ts` because `@prosodio/vtt` owns that check;
      leave `vtt-compare.ts` in place as future VTT/VTT context.
- [ ] Run root `bun run ci`; record evaluation commands and evidence; close the
      epoch without expanding into dense alignment or viewer work.
