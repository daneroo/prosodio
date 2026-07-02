# VTT–EPUB Alignment: Pass 1 Spec (High-Confidence Anchors)

Context: "Prose and Prosody" — syncing a Whisper-generated VTT transcript
(audiobook, m4b) against an EPUB3 ebook. Long books run up to 57hrs; Whisper is
invoked per-segment (max 37hr WAV limit) and re-stitched into one monotonic VTT
before this stage — segment boundary issues are already solved upstream.

This is Pass 1 only: producing a sparse set of very-high-confidence anchor
points. Later passes (windowed relaxation, normalization relaxation, local fuzzy
alignment on residual gaps) are designed to run on the _residual gaps_ left by
this pass, not specified in detail yet.

---

## 1. Data structures

### VTT side

```ts
interface VttWord {
  normText: string;
  rawText: string;
  time: number; // interpolated seconds, linear by word index within cue
  cueIndex: number;
  wordIndexInCue: number;
}
type VttSequence = VttWord[]; // array index = vttWordOffset, the address
```

- Parse cues → tokenize each cue's text → interpolate a timestamp per word
  (start + (end-start)*i/n; char-length weighting is a possible refinement, not
  required for v1).
- Flatten all cues into one flat array. No separate offset scheme — index _is_
  the offset.
- Invert a match: `vttSequence[offset].time`; `cueIndex` recovers the original
  cue if the real (non-interpolated) cue boundary is needed.

### EPUB side

```ts
interface EpubRun {
  spineIndex: number;
  spineHref: string;
  anchorId: string | null; // nearest ancestor element with an id
  anchorPath: number[]; // child-index fallback path (fragile to re-serialization, use only if no id)
}

interface EpubWord {
  normText: string;
  rawText: string;
  runId: number; // index into EpubRun[]
  charStart: number;
  charEnd: number;
}
type EpubSequence = EpubWord[]; // array index = epubWordOffset
```

- Resolve OPF spine order → ordered XHTML files.
- DOM-walk each file in document order, collecting text nodes as "runs." One
  `EpubRun` descriptor per text node/run, referenced by id from each word (not
  duplicated per-word).
- Prefer nearest-ancestor `id` over positional path — survives re-serialization;
  positional path doesn't.
- Exclude `<head>`, hidden elements, nav doc from spine walk. Do **not**
  pre-exclude footnotes/backmatter — let alignment classify these later (see
  §5).
- Invert a match: `epubSequence[offset]` → `runId` → `EpubRun` →
  `(spineHref, anchorId)` + `charStart` → exact DOM position, reconstructable
  for highlighting.

**Critical constraint:** the normalization function (case-folding, punctuation
stripping, number policy) must be byte-identical in behavior on both sides. Any
asymmetry silently kills n-gram matches that should hit.

---

## 2. N-gram candidate generation

- k=6 word sliding window (default; tunable), over both sequences independently.
- Keep only n-grams that occur **exactly once** within each stream (uniqueness
  computed separately per side).
- Intersect by normalized text hash: any n-gram unique in _both_ streams → raw
  candidate `(vtt_pos, epub_pos)`. All Pass-1 candidates are equal-strength — no
  confidence gradient at this stage.

**Complexity:** O(N) generation, O(N) hash-map build/intersect (not O(N²) — use
hash maps, not nested-loop comparison). At 57hr scale (~513k vtt words), this is
sub-second; not a bottleneck. If running repeatedly across parameter sweeps,
worth interning words to ints and packing n-grams into fixed-size tuples/bigints
to cut allocation overhead — optional at single-run scale, worth it for
hill-climbing loops.

```ts
function buildNgramIndex(words: string[], k: number): Map<string, number[]> {
  const idx = new Map<string, number[]>();
  for (let i = 0; i <= words.length - k; i++) {
    const key = words.slice(i, i + k).join("\u0001");
    const arr = idx.get(key);
    if (arr) arr.push(i);
    else idx.set(key, [i]);
  }
  return idx;
}
```

Collision risk with 64-bit hash keys at this N is negligible, but verify actual
words on hit anyway — cheap insurance.

---

## 3. Order resolution (replacing naive left-to-right scan)

**Goal:** retain the largest consistent subset of candidates such that sorting
by `vtt_pos` ascending also gives `epub_pos` ascending (no inversions) — i.e.
both streams read in the same order.

**Why not a plain left-to-right / greedy scan:** ties (multiple candidates
satisfying monotonicity equally well) get resolved in scan order by default,
which systematically favors whichever candidate is encountered first — i.e.
front matter, the least reliable region of the book. Need a tie-break that isn't
positional.

**Approach — recursive bisection ("grow from the middle"):**

```
resolve(candidates, vtt_lo, vtt_hi, epub_lo, epub_hi):
    valid = candidates where vtt_lo < vtt_pos < vtt_hi
                         and epub_lo < epub_pos < epub_hi
    if valid is empty:
        return []                      # branch terminates empty — meaningful signal, see §5
    root = pick_root(valid)
    left  = resolve(valid with vtt_pos < root.vtt_pos,
                     vtt_lo, root.vtt_pos, epub_lo, root.epub_pos)
    right = resolve(valid with vtt_pos > root.vtt_pos,
                     root.vtt_pos, vtt_hi, root.epub_pos, epub_hi)
    return left + [root] + right

top-level call: resolve(all_candidates, -inf, +inf, -inf, +inf)
```

- `pick_root` v1: median candidate by `vtt_pos` in current window (this alone
  gives the "middle-out" property).
- `pick_root` v2 (variant to compare): candidate with largest gap to nearest
  neighbor on either side — most isolated, least likely to be a
  windowed-uniqueness false positive.
- Monotonicity holds **by construction** — any out-of-order candidate fails the
  bound check in every branch it could fall into, so no separate post-hoc
  violator-filter pass is needed.

**Known tradeoff, log it, don't assume it away:** this is not guaranteed to
retain the maximum possible number of non-inverting candidates (an exhaustive
longest-consistent-chain search would be optimal but is a different algorithm).
Given the uniqueness filter already makes inversions rare, the gap is likely
small — but measure `anchors_retained / candidates_available` rather than
assuming.

---

## 4. Seed extension

Only performed on anchors that survived §3 (extending rejected candidates wastes
work and risks reintroducing resolved conflicts).

For each retained anchor, walk outward word-by-word from both ends:

- Compare normalized `vtt_word[i±1]` to normalized `epub_word[j±1]`.
- Continue while exact match.
- Stop at first mismatch, **or** at the boundary already claimed by a
  neighboring anchor's own extension (anchors must never overlap).
- If two neighbors' extensions meet with no mismatch between them, merge into
  one continuous span — fully resolved at word level, nothing left to
  interpolate there.

**Output of Pass 1:** an ordered, non-overlapping, non-inverting list of
`(vtt_time_range, epub_offset_range)` spans.

---

## 5. Free structural signals from the recursion

- **Empty branch at the outermost edges** of the recursion (no candidates near
  book/audio start or end) = expected signature of front/back matter.
- **Empty branch deep in the interior** = not expected; sharper anomaly signal
  than a spine element merely showing low match_ratio, because it also indicates
  _where in the resolution hierarchy_ the gap occurred.

---

## 6. Per-spine-element characterization (separate from anchor resolution, but related)

For each EPUB spine element, compute: `word_count`,
`matched_word_count`/`match_ratio`, `anchor_count`.

- **0% match** → exclude from aggregate coverage metrics, but log as
  `excluded_zero_match` with spine id (don't silently drop) — could be
  legitimate skipped front/back matter, or a real algorithm failure; this list
  is the manual-review worklist, sorted by word_count descending.
- **Low-but-nonzero (<~10%)** → separate band; catches footnote-id files /
  partial-skip chapters that binary 0%-check would miss.
- **Large word_count outlier + good match_ratio + wide internal vtt_time span**
  → signature of a badly-segmented EPUB (multi-chapter content not split into
  separate spine files) — a source-file quality issue, not an alignment issue.
  Cross-check via heading-tag count (`<h1>`/`<h2>`) inside the element.
  Candidate for living in `epub-validate` (structural/parser concern) rather
  than the alignment package, surfaced by alignment when relevant.

Recompute coverage % over _included_ (non-excluded) word count, not total book
word count, so books with more front/back matter aren't penalized independent of
algorithm quality.

---

## 7. Metrics for hill-climbing (composite objective)

```
score = coverage_term - λ1 * sparsity_penalty - λ2 * outlier_penalty
```

- `coverage_term`: word-coverage % (matched vtt words / total, excluding flagged
  spine elements) — pick one primary (word or time coverage), log the other.
- `sparsity_penalty`: derived from Δ-gap distribution tail (p95 gap size, or
  count of gaps exceeding max-acceptable-interpolation-error).
- `outlier_penalty`: count/severity of local-WPM deviations from book median
  (see below) — proxy for wrong anchors, since there's no ground truth.

**Always log the full raw vector, not just the scalar** (needed to compare
algorithms/params, not just rank them):

- Coverage cuts: word-coverage %, range-coverage % (epub span between first/last
  anchor vs total), time-coverage %.
- `candidate_survival_rate` = accepted_anchors / candidate_anchors (pre/post
  §3).
- `anchors_retained / candidates_available` (bisection optimality gap, §3).
- Per-gap stats (sorted by vtt_time): Δt, Δw_vtt, Δw_epub, ratio Δw_epub/Δw_vtt
  (should be ~1.0), implied local WPM = Δw_vtt/Δt.
- Distribution (median/mean/p90/p95/max) of Δt and Δw across all gaps.
- Rolling anchor density (anchors per 1000 vtt words) — surfaces _where_
  coverage thins, not just global average.
- **Local-WPM outlier flag**: independent of matching logic itself, likely the
  highest-value automated error signal.

**Eval set design:** freeze 3–5 books spanning narration style (single-narrator
clean, multi-cast, heavy abridgement), each deliberately chosen to anchor
specific edge cases (see §8) rather than random sampling. Aggregate score across
eval set as **min-across-books** (not mean) — penalizes fragility rather than
averaging it away.

---

## 8. Known edge cases to manually inspect (not yet automatically classified beyond §6)

- Front matter / back matter, **both directions**: EPUB-only material
  (copyright, dedication, about-author) vs. audiobook-only material
  (narrator/credits outro).
- Footnotes — three sub-cases needing different handling: (a) read inline at
  reference point — dangerous, locally inflates Δw_vtt right at the marker,
  looks like a WPM outlier or sparsity gap; (b) read batched at chapter end; (c)
  never read.
- Epigraphs / recurring quotes/refrains — stress-test for windowed-uniqueness
  false positives.
- Numbers/dates spoken vs. printed differently ("Chapter Twelve" vs "12").
- Block quotes/verse/letters — usually fine textually, but confirm DOM
  extraction order isn't affected by distinct CSS formatting.
- Multi-narrator/dramatized passages — speaker tags in print voice-acted instead
  of spoken.

Method: use §5/§6 outputs (empty recursion branches, 0%-match spine elements
sorted by size) as the auto-generated worklist rather than reading full books.
Tag each with a reason code (`front_matter`, `footnote_inline`,
`footnote_batched`, `narrator_extra`, `epigraph_repeat`, `unsplit_spine`,
`unknown`). Shrinking `unknown` share across iterations indicates real progress
vs. threshold tuning.

---

## 9. Explicitly deferred / not yet designed

- Pass 2+: windowed-uniqueness relaxation (shorter n-grams, searched only within
  Pass-1 residual gaps).
- Normalization relaxation pass (number/hyphenation equivalence) within
  remaining gaps.
- Local fuzzy/edit-distance alignment, bounded strictly inside small residual
  gaps.
- WPM-outlier-triggered re-opening of suspect anchor regions.
- Sub-spine-element (paragraph-level) exclusion granularity — v1 is
  element-level only, by design, for simplicity.
