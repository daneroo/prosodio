# matching-quality-design — audiobook <-> EPUB matching, as built

Status: design baseline, dated 2026-07-11. Reproduces the CURRENT matcher
(`packages/align/src`) — algorithm, actual parameter values, and the actual
metrics vector — as the reference point for the matching-quality workstream
(BACKLOG `matching-quality-design`). No code changes implied or made by this doc
(plan `thoughts/plans/player-sync-core.md`, T3.1/S8).

## 1. Pipeline as built

One entry point, `alignBook` (`packages/align/src/align-book.ts`), stated
deterministic in its own header comment: "Deterministic by construction (no
wall-clock values enter the result)." `artifact.ts` restates the same guarantee
for the served artifact: identical inputs serialize byte-identical (no
run-instant, hostname, or wall-clock value anywhere in the model).

```text
buildVttSequence(vttText)   extractEpub(epubBytes, config.extraction)
  parseVtt -> words           spine order; parserPreferenceForHref
  normalizeText (shared)      projectVisibleText -> normalizeText (shared)
        \                           /
         Pass 1: runExactPass, global uniqueness, k=6, full streams
                       |
              reconcile([], pass1.spans)   <- the only span gate
                       |
              computeGaps(accepted)
                       |
         Proof pass (if proofPass !== false): runExactPass PER
         residual gap, gap-scoped uniqueness, k=4
                       |
              reconcile(accepted, proofSpans)   <- same gate again
                       |
              computeGaps(finalAccepted) -> computeMetrics(...)
```

Module map:

- `vtt-sequence.ts` — `buildVttSequence`: flattens parsed cues into one word
  sequence (`VttWord[]`). `timeSec` is for ordering/anomaly metrics only, never
  matching. `timing: "word"` assigns every token in a cue the cue's own start
  second (valid only for word-per-cue VTT); `timing: "interpolated"` spreads
  word times evenly across `[cue.start, cue.end)` (`interpolateWordTimes`,
  `cue-times.ts`).
- `epub-extract.ts` — `extractEpub`: walks `packaging.spine` in order,
  `included = linear || includeNonLinearSpineItems`; `parserPreferenceForHref`
  picks the parser BY EXTENSION (`.html`/`.htm` -> HTML parser even for
  well-formed XHTML; else XML-first with HTML-fallback on parse error) to mirror
  epub.js's own per-extension choice. `projectVisibleText` walks the parsed DOM
  once, document order, emitting visible text (block elements insert `\n`,
  inline don't) plus a parallel DOM segment index (`segPaths`/`segRanges`) for
  later DOM-Range resolution.
- `normalize.ts` — `normalizeText`: the ONE normalizer both streams share. Per
  "unit" (base code point + combining marks): NFKC + lowercase; `[^\p{L}\p{N}]+`
  is a token boundary (punctuation/apostrophes/hyphens all boundaries); digits
  preserved. Policy id `"strict-nfkc-v1"`. Its own header states scope:
  apostrophe/hyphen/diacritic/spoken-number variants are OUT of this pass,
  reserved for "named later passes" — none exist yet.
- `exact-pass.ts` + `lis.ts` — `runExactPass`, the one primitive both passes
  call: n-grams of size `k` occurring EXACTLY ONCE in each stream within the
  window (`uniqueNgramCandidates`) -> maximum-cardinality strictly-increasing
  chain over `epubOffset` via `longestIncreasingSubsequence` (O(n log n), global
  optimum, not a greedy heuristic) -> merge same-diagonal
  (`vttOffset - epubOffset` constant) candidates into spans
  (`coalesceDiagonalRuns`) -> trim later-span starts where different-diagonal
  neighbors overlap by up to `k-1` tokens, dropping spans a trim fully absorbs
  (`trimOverlaps`) -> grow each span outward while tokens match exactly, bounded
  by window edge and neighbors, merging spans whose extensions meet with no
  mismatch (`extendSpans`). Output `MatchedSpan[]` carries `SpanEvidence`
  (`kind: "exact-unique-ngram"`, `ngramSize`, `uniquenessScope`, `anchors` =
  coalesced candidate count, `extendedLeft`/`extendedRight`).
- `reconcile.ts` — `reconcile`: the ONLY way a span enters the accepted set,
  called after every pass. Rejects: empty/inverted range, out-of-bounds, overlap
  with an accepted span on either axis, or "crosses an accepted span" (same-side
  test differs between axes). No pass, however weak, can move, replace, or cross
  a stronger accepted span. `computeGaps`: residual
  `[vttStart,vttEnd) x [epubStart,epubEnd)` regions between consecutive accepted
  spans, incl. leading/trailing; zero-width on one axis kept, fully empty (both
  axes) dropped.
- `metrics.ts` — `computeMetrics`: the full evaluation vector, section 3.

Two passes run today, both through `runExactPass`, not a configurable list:

1. **Pass 1** (`align-book.ts`) — `passId = "pass1-exact-k6"`,
   `uniquenessScope: "global"`, full-stream window.
2. **Proof pass** (gated by `AlignOptions.proofPass`, default on) —
   `passId = "proof-exact-k4"`, `uniquenessScope: "gap"`, run independently PER
   residual gap from Pass 1's accepted set, reconciled against Pass 1's accepted
   spans — it can only ADD spans inside gaps, never touch a Pass-1 span.

## 2. Current parameters (baseline, `packages/align/src/config.ts`)

```text
passes.pass1NgramSize        = 6      # Pass 1 exact n-gram size
passes.proofNgramSize        = 4      # proof-pass exact n-gram size
normalizationPolicy          = "strict-nfkc-v1"

extraction.includeNonLinearSpineItems = true   # conservative baseline
extraction.excludedElements  = ["head", "script", "style"]

metrics.lowMatchRatio        = 0.1    # spine flagged below this match ratio
metrics.densityBucketMinutes = 10     # anchor-density rolling bucket
metrics.anomalyWpmMin        = 80     # implied-narration-wpm plausibility band
metrics.anomalyWpmMax        = 260
metrics.anomalyWordRatioMin  = 0.5    # epub/vtt token-count ratio band
metrics.anomalyWordRatioMax  = 2
metrics.anomalyGapMinTokens  = 20     # gap floor before anomaly checks apply
```

Every result echoes this config verbatim (`config` block in both the CLI report
and the served artifact) so runs stay reproducible and comparable. Config's own
header: "Values are fixed baselines to evaluate, not eternal constants."

## 3. Current metrics vector (`metrics.ts`)

Header states the design rule directly: "always report [the raw vector]; a
composite score may rank experiments but never replaces the measurements."
Zero-match spine documents stay in the primary coverage figure; anomalies feed a
review worklist, they never prove an anchor correct.

`AlignmentMetrics` fields and where each surfaces:

| Field                                         | What it is                                                                                                                                        | Surfaces                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `passes: PassStats[]`                         | per pass: `passId`, `candidates`, `selected`, `survivalRate` (selected/candidates, 1 if none), `acceptedSpans`                                    | CLI report (`metrics.passes`), artifact `match.metrics.passes`                                  |
| `vttTokens`, `epubTokens`                     | total tokens per stream                                                                                                                           | report, artifact                                                                                |
| `vttMatchedTokens`, `epubMatchedTokens`       | tokens inside any accepted span                                                                                                                   | report, artifact                                                                                |
| `vttCoverage`, `epubCoverage`                 | matched/total ratio, gross (every extracted spine doc counted)                                                                                    | report, artifact, AlignmentViewer header (`narration NN% · book NN%`)                           |
| `spanCount`, `gapCount`                       | accepted span / residual gap counts                                                                                                               | report, artifact, AlignmentViewer header                                                        |
| `gapVttTokens`, `gapEpubTokens`, `gapSeconds` | `DistributionSummary` (count/min/max/mean/median) over gap sizes                                                                                  | report, artifact                                                                                |
| `spines: SpineStats[]`                        | per spine doc: `tokens`, `matchedTokens`, `matchRatio`, `anchorSpans`, `zeroMatch`, `lowMatch` (`< lowMatchRatio`)                                | report, artifact; zero/low-match spines also feed `warnings`                                    |
| `anchorDensity: DensityBucket[]`              | accepted-span count per `densityBucketMinutes` narration-time bucket, keyed by each span's start-token time                                       | report, artifact                                                                                |
| `anomalies: GapAnomaly[]`                     | gaps at/above `anomalyGapMinTokens` flagged for implied-wpm out of band, word-ratio out of band, vtt-only, or epub-only, with `reasons: string[]` | report, artifact; drives the CLI report's stratified `reviewSamples` (anomaly-adjacent stratum) |
| `warnings: string[]`                          | zero/low-match spine notices + reconciliation rejections (`collectRejections` in `align-book.ts`) + upstream VTT/EPUB extraction warnings         | report, artifact                                                                                |

Surfacing beyond the table: the **CLI report** (`apps/align/lib/report.ts`,
`BookReport`) carries the metrics block verbatim plus report-only projections
not in the artifact — `spans[].addresses`, `vttStartSec`/`vttEndSec` per span,
and a deterministic stratified `reviewSamples[]` (edge-first, edge-last,
interior-median, up to 3 anomaly-adjacent) with raw VTT/EPUB text for manual
read — written to `reports/<root>/<base>.alignment.json` (`summary.json` carries
only per-book `spans`/`vttCoverage`/`epubCoverage`/`anomalies`/`warnings`
counts). The **artifact** (`artifact.ts`, `match.metrics`) embeds the FULL
`AlignmentMetrics` object as-is (`metricsSchema` mirrors it field-for-field)
inside the versioned, cached, browser-served payload
(`ALIGNMENT_ARTIFACT_SCHEMA_VERSION = 3`). The **player**
(`AlignmentViewer.tsx`) reads `prepared.artifact.match.metrics` directly for its
header strip (`narration NN% · book NN% · N spans · N gaps`); per-gap
`GapMarker` rows show only a token count from `match.gaps`, not `anomalies`; a
separate `locateFailure` prop (EPUB DOM-locate failures, not a matching metric)
renders its own banner.

## 4. Evolution affordances (design intent, not a commitment)

The current baseline already carries the DATA SHAPES a future pass registry
would need, even though today's code hardcodes exactly two sequential calls:

- EA1 — **Additive passes through the same gate.** `runExactPass` is already a
  reusable primitive parameterized by `passId`/`ngramSize`/
  `uniquenessScope`/window; the proof pass proves the pattern (candidates scoped
  to `computeGaps(accepted)`, reconciled against the existing accepted set, so
  it can only fill gaps, never override). A future weaker/different pass slots
  in the same way — no new gate needed, `reconcile.ts` is already pass-agnostic.
- EA2 — **`passId` + `PassStats[]` are already the registry's naming/
  bookkeeping surface.** `BookAlignment.passes: PassStats[]` and each span's
  `evidence.uniquenessScope` already give per-pass survival/acceptance
  bookkeeping and ordinal confidence (`SpanEvidence`'s own comment: "a globally
  unique k=6 anchor outranks a k=4 anchor unique only within one residual gap").
  Turning the two hardcoded calls into a literal `passes: PassDefinition[]`
  config array is a small, additive step from here — not built today.
- EA3 — **Experiments = parameter set + re-baselined report diff.** Every result
  already echoes `config` (both report and artifact); comparing an experiment to
  baseline is diffing two `reports/` runs at fixed inputs.
- EA4 — **Metrics stay in reports/views; never fatten the artifact further.** A
  rule for what gets ADDED going forward, not a description of today (see
  Discrepancies) — new metrics (e.g. the histogram in section 6) belong in
  reports/derived views, not in `match.metrics`.
- EA5 — **Schema version bumps only for locator/column shape changes**, not
  metric additions — `ALIGNMENT_ARTIFACT_SCHEMA_VERSION` (now 3) tracks
  `vtt`/`epub` columnar shape and `match.spans`/`match.gaps` shape; metrics work
  should not need a bump under EA4.

## 5. Future directions (unscoped, recorded from Daniel 2026-07-10)

Not designed, not planned — placeholders for the workstream to pick up:

- Gap heuristics: qualifying SKIPPED words inside a residual gap (narrator
  omission vs. real mismatch) rather than treating every gap token uniformly.
- Content qualification: front/back-matter discovery, footnotes read-or-skipped
  by the narrator, audio-only segments (narrator introductions) that break the
  linear-order assumption the whole pipeline currently makes (spans strictly
  monotonic on both axes, per `reconcile.ts`).

## 6. First candidate increment: histogram of gap lengths

View-only. Derived CLIENT-SIDE from `match.gaps`/`match.spans` already in the
artifact (`gap.vttEnd - gap.vttStart` or `.epubEnd - .epubStart` per gap,
bucketed) — no new server computation, no new artifact field. Natural home: the
reserved `/lab/align` summary card (`apps/bookplayer/src/routes/lab.index.tsx`
already lists it as "Reserved: match-quality views (coverage, gaps, metrics)").
Explicitly NOT added to `match.metrics` or any other artifact payload (EA4) — it
is a report/view projection over data the artifact already carries.

## Discrepancies and notes (code vs. brief)

- **Metrics-in-artifact is already true, not aspirational.** "Metrics live in
  reports/views, never fatten the artifact" could be misread as describing the
  current baseline. It does not: `match.metrics` in `artifact.ts` already
  carries the complete `AlignmentMetrics` object. EA4 above is a forward rule
  for future additions.
- **No literal pass registry exists yet.** `align-book.ts` hardcodes exactly two
  sequential `runExactPass` calls. There is no `passes: PassDefinition[]` config
  array today — EA1/EA2 describe how the existing primitive and data shapes make
  that cheap to add, not something already wired.
- **DOM engine choice is an open item, not settled here.** `epub-extract.ts`'s
  own header flags jsdom-always-in-process as an "UNRESOLVED PARSER DECISION —
  placeholder, not decided policy" (BACKLOG `align-epub-parser-decisions`).
  Reproduced as-is; this doc does not resolve it.
- **"word" VTT timing is cue-start, not per-word.** `timing === "word"` assigns
  every token in a cue the CUE's start second, not an individual per-word
  timestamp — correct only under a word-per-cue VTT structure. Time is
  ordering/metrics-only regardless (never a matching signal), so this affects
  anomaly timing precision, not match correctness.
