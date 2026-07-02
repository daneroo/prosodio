# epoch4-alignment — VTT–EPUB alignment design

Status: draft

This is the working design for Epoch 4. It replaces the two initial design
drafts, which remain available in Git at the WIP checkpoint `f915fe2`.

## Goal

Given a Whisper-generated VTT transcript and its EPUB, produce a sparse, ordered
set of high-confidence spans connecting transcript word positions and times to
EPUB text positions.

Epoch 4 does not need a complete word-for-word alignment. It must prove a
reliable first pass and an architecture in which later passes can add matches
inside unresolved gaps without changing the input model or invalidating stronger
earlier matches.

## Scope

In scope:

- deterministic VTT and EPUB token streams;
- a DOM-independent EPUB text address;
- exact unique n-gram candidates;
- maximum-cardinality monotonic candidate selection;
- exact extension and coalescing into sparse matched spans;
- at least one proof that a later, weaker pass can operate only inside residual
  gaps;
- evaluation that measures precision, coverage, gaps, and anomalies separately.

Deferred:

- dense alignment of every narrated word;
- fuzzy/edit-distance alignment;
- number and pronunciation equivalence;
- chapter-mark alignment;
- EPUB viewer integration, highlighting, and CFI;
- player, finder, TTS, and search concerns.

`audio-deno-match` is historical context: a previous, overly complicated
implementation that may be useful for later comparison. It is not an Epoch 4
implementation input and does not need to be mined or ported. The current
prosodio `vtt-compare.ts` aligns two transcriptions of the same audio source; it
is context for a possible future VTT/VTT capability, not an Epoch 4 input.
`chapter-marks-match` is context for a later capability, not an Epoch 4
implementation source.

`apps/align` owns the first runnable workflow and its configuration. Reusable
matching logic stays app-local until a real second consumer justifies extracting
a package.

## Invariants

- Both input streams preserve their original order.
- Accepted spans are non-overlapping and strictly monotonic in both streams.
- A weaker pass may add spans only inside gaps bounded by stronger accepted
  spans. It cannot move, replace, or cross those bounds.
- Matching operates on normalized tokens and opaque source positions. It does
  not know about VTT cues, DOM nodes, EPUB CFIs, element IDs, or child paths.
- Every output records the extraction, normalization, and matching parameters
  needed to reproduce it.
- Coverage is never used as a substitute for correctness.

## Inputs

### VTT sequence

Parse the VTT through `@prosodio/vtt`, then tokenize cue text into one flat
sequence. Each word retains:

- normalized text used by matching;
- raw text for diagnostics;
- its sequence offset;
- cue index and word index within the cue;
- a monotonic time estimate.

Word-level timestamps are useful but are not an input requirement.

- When provenance says `wordTimestamps: true`, use the cue timing directly.
- Otherwise, interpolate token starts within each cue:
  `start + (end - start) * i / n`.

Interpolation does not claim word-level timing accuracy. Epoch 4 uses time for
ordering, navigation, and anomaly metrics; textual positions decide matches. The
parsed VTT must already have non-decreasing cue order. Interpolation merely
preserves that order within each cue.

### EPUB sequence

Traverse content documents in spine order, not TOC order. The TOC is a partial
labeling structure and is not the book's authoritative text sequence.

For each spine document:

- walk text in document order;
- exclude only structurally unambiguous non-content such as `head`, `script`,
  and `style` in the first baseline;
- build normalized text and a normalized-to-raw location map;
- tokenize with the same normalizer used for VTT;
- retain the spine metadata and extraction flags for later characterization.

Do not assume the spine metadata or content model is high quality. In
particular, handling of `linear="no"`, navigation documents, and explicitly
hidden content must be recorded configuration rather than an implicit filter.
The conservative baseline includes `linear="no"`; evaluation must compare an
exclusion variant before changing that default.

### EPUB text address

The canonical EPUB position is:

```ts
interface EpubTextAddress {
  spineIndex: number;
  spineHref: string;
  start: number;
  end: number;
}
```

`start` and `end` are a half-open character range in that spine document's
normalized text stream. The extraction layer owns the mapping back to raw text
and, eventually, a viewer range.

The matching algorithm treats this value as opaque. It matches sequence offsets;
the EPUB sequence maps those offsets to addresses. No DOM identity, ancestor ID,
child-index path, or CFI enters the matcher.

This representation is intentionally simple and reproducible. A later viewer can
rebuild the same normalized-to-raw map against its own DOM rather than depending
on two parsers producing isomorphic trees.

## Strict normalization baseline

The early prototype used:

```ts
text
  .toLowerCase()
  .replace(/[\W_]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();
```

That is a useful behavioral reference but JavaScript `\W` is ASCII-oriented; it
drops letters outside `[A-Za-z0-9_]`. The new baseline must retain Unicode
letters and numbers:

```ts
text
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();
```

This intentionally treats punctuation, apostrophes, and hyphens as boundaries
and preserves digits. It is a strict first-pass policy, not a claim that it
maximizes coverage. Alternative apostrophe, hyphenation, diacritic, and
spoken-number rules belong to named later passes inside residual gaps.

The production normalizer must produce tokens and the offset map in one pass so
normalization cannot drift from addressing.

## Pass framework

Each matching pass receives:

- the same immutable VTT and EPUB token sequences;
- the spans already accepted by stronger passes;
- the remaining gaps bounded by those spans;
- explicit pass parameters.

Each pass emits candidates with evidence, not final mutations. A shared
reconciliation step enforces bounds, monotonicity, and non-overlap before adding
new accepted spans. Output spans record `passId`, parameters, and evidence so a
consumer can distinguish strict anchors from later heuristic matches.

This makes confidence ordinal and explainable: an exact globally unique
six-token anchor from Pass 1 is stronger than a four-token anchor unique only
inside one residual gap. A fabricated floating-point confidence score is not
needed initially.

## Pass 1 — strict high-confidence anchors

### Candidate generation

- Generate a sliding window of `k = 6` normalized tokens over each complete
  sequence.
- Retain n-grams that occur exactly once in the VTT sequence and exactly once in
  the EPUB sequence.
- Intersect the unique keys to produce `(vttOffset, epubOffset)` candidates.
- Verify the actual token arrays on every hash hit.

Generation is O(N) expected time and space with hash maps. The fixed `k = 6` is
a baseline to evaluate, not an eternal constant.

### Monotonic selection with LIS

Sort candidates by `vttOffset`, then consider their `epubOffset` values. A valid
ordered anchor set is a strictly increasing subsequence of those EPUB offsets.
Select a longest increasing subsequence (LIS).

With equal-strength Pass 1 candidates, LIS gives the maximum number of mutually
monotonic candidates in O(M log M), where M is the candidate count. This is a
global optimum for candidate count, not an exhaustive search.

Recursive middle-out bisection does not have that guarantee because it commits
to a root before seeing the effect on the whole chain. For candidates whose EPUB
offsets in VTT order are:

```text
1, 2, 100, 3, 4
```

Choosing the middle candidate `100` as the root retains at most `1, 2, 100` and
discards `3, 4`. LIS returns `1, 2, 3, 4`. The bisection result depends on an
early heuristic choice; LIS directly solves the ordering objective.

LIS maximizes retained candidates, not truth. Precision still comes from exact
unique n-grams and evaluation. If later candidates carry different evidence
weights, use a maximum-weight increasing subsequence or reconcile confidence
tiers in separate passes; do not overload the Pass 1 objective.

### Coalescing and exact extension

- Coalesce overlapping or adjacent accepted n-grams that follow the same
  VTT/EPUB diagonal into exact matched spans.
- Extend each span outward while normalized tokens match exactly.
- Bound extension by neighboring accepted spans so spans cannot overlap or
  invert.
- Merge neighboring spans when their extensions meet with no mismatch.

The Pass 1 result is an ordered list of exact, non-overlapping sparse spans.

## Multipass proof

The first weaker pass should demonstrate the architecture without attempting a
complete aligner:

- enumerate residual gaps between Pass 1 spans;
- generate smaller exact n-grams, initially `k = 4`, independently inside each
  gap;
- compute uniqueness within that gap, not globally;
- select a local LIS bounded by the existing left and right anchors;
- coalesce and extend the new spans without changing Pass 1 spans;
- label every new span with its weaker pass and parameters.

This proof is successful if it adds correct spans in at least one real residual
gap, never alters a Pass 1 span, and uses the same sequence, address, output,
and reconciliation contracts. Further normalization or fuzzy passes can then
follow the same protocol.

## Output

The result is sparse and contains:

- source/provenance identifiers for the VTT and EPUB;
- normalization and EPUB extraction configuration;
- ordered matched spans with VTT offset range, EPUB offset range, resolved
  `EpubTextAddress` range, and approximate VTT time range;
- pass identity and matching evidence for every span;
- unresolved gaps between spans;
- raw evaluation metrics and warnings.

The serialized schema is an Epoch 4 implementation decision. It must preserve
the distinction between source sequence offsets, source addresses, and timing.

## Metrics

Always report the raw vector; a composite score may rank experiments but cannot
replace the underlying measurements.

- candidate count and accepted count per pass;
- candidate survival rate after monotonic reconciliation;
- exact matched-token coverage for both VTT and EPUB;
- gross EPUB coverage including every extracted spine document;
- per-spine word count, matched count, match ratio, and anchor count;
- gap distributions in VTT words, EPUB words, and elapsed time;
- rolling anchor density;
- local implied WPM and EPUB/VTT word-ratio anomalies;
- deterministic warnings for zero-match and low-match spine documents.

Do not automatically remove zero-match spine documents from the primary coverage
figure. A zero-match document may be front matter, or it may expose an algorithm
failure. Report optional adjusted coverage only after the document has an
explicit reason classification, and retain gross coverage beside it.

WPM, gap, and density anomalies generate a review worklist. They do not prove an
anchor correct.

## Evaluation

### Public fixture

Alice's Adventures in Wonderland is the reproducible public smoke/evaluation
pair:

- EPUB: committed under `fixtures/audiobooks/`;
- M4B: fetched and hash-verified through `fixtures/manifest.jsonc`;
- VTT: committed as
  `fixtures/transcriptions/Lewis Carroll - Alices Adventures in Wonderland.vtt`.

The current VTT records basename-only inputs and `wordTimestamps: false`. It is
therefore the public test of the interpolation path, not merely a happy path
with native word timing.

### Private evaluation set

Discover VTT files from the configured transcription root (initially
`data/transcribe/output/*.vtt`) and `.m4b` files recursively from the configured
external audiobook corpus (currently `/Volumes/Space/Reading/audiobooks` on the
development machine). Exact basename is the deterministic pairing key; the
book's EPUB is then resolved from the matched audiobook entry. Unmatched,
duplicate, and ambiguous candidates are reported rather than guessed.

The default private run processes every unambiguous matched triplet. A
case-insensitive `-s, --search <terms>` filter supports targeted reruns after
pairing. Every whitespace-delimited query term must occur in the combined
relative corpus path and basename; the filter never changes pairing or guesses
at an unmatched title.

`apps/transcribe/scripts/many/do-series.sh` is the usage reference for this
multi-term filter and its CLI examples. The alignment command intentionally
differs by making search optional and processing all matches when it is absent;
it does not require an interactive picker.

`apps/align/lib/config.ts` centralizes these roots and algorithm parameters
using the existing app config pattern. Private inputs and reports remain outside
committed fixtures under the repository's privacy rules. Fixture tests, filtered
runs, and the default all-matched run use the same alignment pipeline.

### Acceptance evidence

- Determinism: identical inputs and config produce byte-identical results.
- Structural correctness: all accepted spans are ordered, non-overlapping, and
  within source bounds.
- Pass 1 precision: manually inspect at least one accepted span per matched book
  plus deeper edge, interior, and anomaly-adjacent samples; no known false
  accepted anchor is allowed in the high-confidence tier.
- Multipass safety: the proof pass adds correct matches in at least one residual
  gap and leaves all Pass 1 spans unchanged.
- Coverage: characterize it, but do not set a minimum until the first baseline
  shows what strict anchors achieve across the evaluation set.
- Failure visibility: zero-match spine items, large gaps, and anomalous local
  rates appear explicitly in output rather than being silently excluded.

## Open implementation decisions

- Select the private evaluation books and record why each is included.
- Set the manual review sample size after observing Pass 1 anchor counts.
- Finalize extraction configuration flags after comparing the Alice and private
  corpora, especially `linear="no"` handling.
- Define the serialized result schema just in time for the first consumer.
