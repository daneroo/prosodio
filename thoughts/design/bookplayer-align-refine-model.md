# bookplayer-align — refine alignment model

Status: refined proposal, rev 2 (2026-07-08) — incorporates Daniel's rulings (no
backward compat; transport compression is a smell to remove, not
institutionalize; cache under `data/bookplayer/cache/`). Executable plan:
[plans/bookplayer-align-refine-model.md](../plans/bookplayer-align-refine-model.md).

The merged `bookplayer-align` branch proves token-level audio ↔ transcript ↔
EPUB synchronization, but the data model is not the model we want to keep. It
mixes matcher coordinates, source-native addresses, transport encoding, and UI
presentation concerns.

## Problem

Alignment has three different jobs:

1. Match normalized VTT tokens to normalized EPUB tokens.
2. Preserve native source addresses so a match can be mapped back to real VTT
   cue text and real EPUB DOM ranges.
3. Serve browser playback efficiently: time → token → transcript row + EPUB
   range.

The current representation blurs those jobs — and the clearest symptom is the
hand-rolled transport compression. The base64 typed-array columns exist because
a fat per-token JSON model (repeated object keys × 100k tokens, the badfix's 31
MB lesson) was being re-encoded per request through a server function. That
compression layer is a smell: it compensates for a redundant model pushed
through the wrong pipe. v2 removes the causes — redundancy in the model,
re-encoding in the serving path — so the bespoke encoding becomes unnecessary
rather than load-bearing.

## Current state (what merged, concretely)

- `AlignmentResult` v1 (packages/align/src/result.ts) is the disk-cached matcher
  output. Its spans carry derived fields (`vttStartSec/vttEndSec`,
  normalized-text `addresses`) alongside pure match coordinates.
- The bookplayer server rebuilds everything else per request
  (apps/bookplayer/src/lib/alignment.ts `loadAlignment`): re-parses the VTT,
  re-extracts the EPUB (LRU of 1), joins spans onto transcript cues
  (`joinAlignedCues` — presentation policy on the server), then encodes columnar
  base64 wire types (`alignment-wire.ts`) plus a separate `EpubLocatorIndex`
  (`epub-locator.ts`).
- The wire duplicates source text: every token's `raw` is concatenated into
  `rawText` + `rawLengths`, though each raw is a slice of cue text
  (`normalizeText` already computes `rawStart/rawEnd` per token — the native
  offsets exist and are discarded).
- Per-token time is stored twice (startSec + endSec columns) though both derive
  from the cue table: interpolated timing is a formula over cue start/end, and
  word timing is the containing cue's start.
- VTT cue identity is an implicit cross-parser assumption: the join matches
  bookplayer's transcript parse against engine `cueIndex` by array position.
- EPUB identity is DOM-path parity between server jsdom extraction and epub.js
  browser parsing; failures are diagnosed (`DomPathRangeFailure`,
  `LocateResult`) but only token by token, at locate time.
- The cache lives at `data/bookplayer/align/<bookId>.json` (created by the
  merged branch — `cachePath` in alignment.ts), holding `{key, result}` with v1
  inside.

## Scale (measured, drives the encoding decision)

- Alice (fixtures): 2,524 cues, ~34k words, interpolated timing.
- Longest private book (Crippled God): 24,299 cues, ~450k words — the budget
  case. EPUB token counts are the same order.
- Word-timestamped VTTs may approach cue-per-word, so the cue table itself can
  be token-scale: cue data must be columnar too, never per-row objects.

## Proposed model

One versioned artifact, three data sections, presentation always derived.
Canonical in `packages/align`, Zod-validated. Wire principle: row objects only
for small tables (spans, gaps, spines, metrics); plain parallel JSON `number[]`
columns for anything cue- or token-scale. No base64, no typed arrays on the
wire.

```
AlignmentArtifact (schemaVersion: 2 — v1 is deleted, never cohabits)
- schemaVersion, features: string[]
- source, config              — deterministic echo, carried from v1
- match                       — matcher coordinates, semantics unchanged
  - spans: { passId, vttStart, vttEnd, epubStart, epubEnd, evidence }[]
  - gaps:  { vttStart, vttEnd, epubStart, epubEnd }[]
  - metrics                   — v1 metrics block
- vtt                         — native source index
  - cues (columnar, parallel by cue index):
    - startSec   number[]     seconds, ms precision (source precision)
    - endSec     number[]
    - text       string[]     cue text shipped once; tokens slice into it
  - tokens (columnar, one entry per flat VTT token):
    - cueIndex   number[]
    - charStart  number[]     half-open range into cues.text[cueIndex]
    - charEnd    number[]
- epub                        — native source index
  - spines: { href, parseMode: "xhtml" | "html-fallback",
              segPaths: number[][], segTextLen: number[] }[]
  - tokens (columnar, one entry per flat EPUB token):
    - spineIndex  number[]
    - startSeg    number[]
    - startOffset number[]
    - endSeg      number[]
    - endOffset   number[]
```

Derived (never stored): per-token time (word timing → containing cue's start;
interpolated → the cue-interpolation formula; one shared helper in
`packages/align` so the policy exists once), per-token `endSec`, `matched`,
`epubSeq` (linear pass over spans), per-cue matchedRatio/status, gap markers,
coverage labels. Derive + active-token-search helpers live in the package's
browser-safe entry next to `rangeFromDomPath`, unit-tested once.

Browser hot paths, all O(1) or O(log n) over flat columns:

- `currentTime → token`: binary search on the derived token-time column;
- `token → cue row + highlight range`: `cueIndex[i]`, `charStart/charEnd[i]`;
- `token → EPUB token`: derived `epubSeq[i]`;
- `EPUB token → DOM Range → CFI`: seg/offset columns + per-spine segPaths
  (today's resolver, unchanged).

Presentation win: `charStart/charEnd` let the viewer render cue text with
punctuation and spacing intact (today tokens re-join with single spaces).
Degenerate cues (all words normalized away) need no special case: zero tokens
reference the cue, client renders its text unmatched.

### Size budget (estimate; acceptance measures the real thing)

Crippled God (~450k tokens/side, 24k cues): VTT columns ~6 MB raw JSON, EPUB
columns ~10 MB, cue text ~3.5 MB (it IS the transcript), segPaths ~1-2 MB.
Roughly 20 MB raw → served gzipped: small-int columns with long runs (cueIndex,
spineIndex, near-identical seg pairs) compress very well; expected low
single-digit MB on the wire, one-time `JSON.parse` in the low hundreds of ms.
Alice lands around 1/13 of that. Note base64(u32) is ~5.3 bytes/value fixed and
hides runs from gzip — plain small-int JSON is typically SMALLER on the wire
than today's encoding, as well as simpler and inspectable. If a real book still
breaks player stability, a packed column variant slots in behind the codec seam
(one module, `features`-flagged) — that is the only place encoding complexity is
ever allowed to return.

## Decisions (proposed — marked, not asserted)

- D1 One artifact, one boundary. `AlignmentArtifact` v2 in `packages/align` is
  the only cross-package contract; `alignment-wire.ts`, `epub-locator.ts`
  index-building, and `typed-base64.ts` dissolve. `apps/align`, bookplayer
  server, and bookplayer client all consume it.
- D2 Half-open `start/end` offsets everywhere — consistent with normalize.ts,
  contracts.ts, and dom-path locators.
- D3 Redundancy rule: store nothing derivable in linear time client-side.
  Dropped from storage: all per-token time, `matched`, `epubSeq`, raw token
  text, and from spans the derived `vttStartSec/vttEndSec` and normalized-text
  `addresses` (report-time projections if the report wants them).
- D4 Encoding is plain columnar JSON + HTTP gzip. No base64, no typed arrays, no
  re-encoding layer. The codec seam is one module with encode/decode of the
  column block, so packing can return later without touching the model — but it
  is not built now.
- D5 EPUB addresses stay DOM segment references, not prebuilt CFIs. A CFI is an
  encoded DOM path: pre-building at extraction time inherits the same
  jsdom/epub.js parse-parity risk while losing structured diagnostics, and risks
  epub.js CFI dialect mismatches. The browser needs the live Range anyway (text
  guard, highlight); epub.js `cfiFromRange` on that Range stays the ground
  truth. CFIs remain browser-generated — today's behavior, now stated as
  contract.
- D6 Parity becomes checkable, per section, up front. `segTextLen` lets the
  browser validate the entire segment table against the freshly parsed section
  DOM on first load — segment count plus per-segment text length — one
  section-level parity report instead of token-by-token discovery.
- D7 Transport is the artifact itself, served as a cacheable HTTP asset (ETag
  from the staleness key), not re-encoded through a server function. Cache moves
  to `data/bookplayer/cache/<bookId>.alignment.json`; `data/bookplayer/align/`
  is deleted (no migration — regenerate). The staleness key (schemaVersion +
  source mtimes) lives in a small sidecar so the artifact file stays pure,
  servable bytes; optional `.md` summary sidecar for human inspection (low
  priority).
- D8 No backward compatibility. `AlignmentResult` v1 is deleted, not deprecated;
  v1 and v2 never cohabit. `apps/align` derives its report from the
  artifact/live run; report format is free to change and reports/ is
  re-baselined once. The matcher is untouched, so span/gap/metrics VALUES are
  unchanged — only envelopes move.
- D9 The viewer is self-sufficient; the transcript keeps its separate lazy path.
  Fetching the artifact triggers first-run alignment compute (minutes-scale on
  private books) — the Transcript panel must never pay that. Cue identity across
  panels stops being load-bearing (the viewer renders its own cue table); both
  paths parse via `@prosodio/vtt`. Serving the VTT directly to the media element
  (`<track>`) remains open later; the artifact does not preclude it.
- D10 Record the parse mode per spine document; do not change extraction policy
  in this refactor. Server extraction is content-driven (XML first, lenient HTML
  on malformed XML); epub.js is extension-driven (verified in epubjs@0.3.93
  archive.js/request.js: `.xhtml` → `application/xhtml+xml`, `.html`/`.htm` →
  `text/html`). A section whose server mode differs from the extension-predicted
  browser mode is a PREDICTED parity risk, visible in the artifact before any
  browser runs. Changing the extraction policy (e.g. adopting epub.js's
  extension rule) would change matcher input on affected books — that belongs to
  the existing BACKLOG `align-epub-parser-decisions` item, decided on sweep
  evidence (L3 below), not inside this refactor.

## The DOM path: capture → resolution → epubcfi

The chain the "show in book" / follow feature depends on, end to end:

```
extraction (server, jsdom)                 browser (epub.js section)
--------------------------                 -------------------------------
projectVisibleText walks the parsed        section.load parses the SAME
content document once, emitting            spine HTML with the browser's
- segPaths[i]: childNodes index path       DOMParser (mime by extension)
  from document root to text node i        resolveNodeAtPath walks segPaths
- segTextLen[i]: its text length     ───►  → Text nodes → Range
- per-token {startSeg, startOffset,        → normalize-text guard
  endSeg, endOffset}                       → section.cfiFromRange(range)
                                           → rendition.display / highlight
```

A DOM path is only valid against a tree structurally identical to the one it was
captured from. Two different parsers reading the same bytes:

- Same mode, well-formed XHTML: XML defines a unique tree — divergence is
  limited to implementation edge cases (undeclared entities like `&nbsp;`
  without DTD processing, text-node chunking, CDATA handling).
- Same mode, text/html: the WHATWG parsing algorithm is fully specified,
  including error recovery; jsdom (parse5) and browsers agree in practice.
- MODE MISMATCH — the dominant risk, now predictable per section (D10): server
  fell back to lenient HTML but the extension says `.xhtml` (browser gets an XML
  parsererror tree — guaranteed divergence), or the file is `.html`/`.htm`
  (browser parses HTML) while the server parsed it as XML
  (recovery/normalization differences possible).
- epub.js post-parse hooks (base injection, replacements) are assumed not to
  restructure body text nodes — an assumption the sweep validates, not an
  asserted fact.

So the honest claim: the DOM path is NOT provable across parsers. It is
deterministic in principle for the aligned-mode cases and empirically validated
everywhere else. The design's job is to make divergence detectable, predictable,
and measurable — a three-layer validation ladder:

- L1 capture self-check (CI, server-only): after extraction, resolve every token
  locator against a fresh jsdom re-parse of the same section and verify the
  range text round-trips to the token's raw slice. Proves the capture and the
  resolver are correct within one parser; runs on the Alice fixture in
  `packages/align` unit tests.
- L2 runtime section parity (the D6 gate): on first browser load of a section,
  validate the whole segment table (count + per-segment text length) before
  trusting any token locate in it. Cheap, always on.
- L3 locate-coverage sweep (dev-only, in the real browser through the real
  epub.js): for EVERY matched EPUB token in a book — resolve the DOM path, run
  the text guard, generate the CFI via `section.cfiFromRange`, and round-trip it
  (`new EpubCFI(cfi)` → `toRange(document)` → text compare). Report per section:
  parseMode, parity result, tokens checked, failures by reason. This answers
  Daniel's question "do ALL matched tokens produce a WORKING epubcfi" — per
  book, empirically, without rendering each one.

Why there is no server-side CFI test: `Range → epubcfi` is epub.js code that
only meaningfully runs against the browser-parsed section epub.js will actually
display (D5). A CFI generated server-side under jsdom would exercise a different
tree and prove nothing about the renderer. Token → Range IS server-testable
(L1); Range → CFI is validated only where it is real (L3). The sweep lives as a
dev-gated bookplayer page (never CI, since it needs a browser + served book); it
doubles as the diagnostic tool for private-book locator triage. Temporary vs.
keep is Daniel's call at acceptance.

## Robust EPUB location

EPUB location should fail loudly, specifically, and once per cause.

- On first load of a section for locate, validate parity: walk the
  browser-parsed DOM once, compare segment count and each segment's text length
  against `segTextLen`. Cache the result per section.
- Parity OK → token locates proceed; the existing per-token text-equality guard
  stays as a cheap final check.
- Parity failed → the section is marked unlocatable: one structured console
  report (spineIndex, expected/actual segment counts, first divergent segment
  and its path), one UI warning; further tokens in that section skip without
  emitting N identical failures.
- The merged failure taxonomy (`DomPathRangeFailure`, `LocateResult` reasons) is
  kept and consolidated into `packages/align` as the canonical diagnostic types.
- Never highlight a plausible repeated word on failed validation — whole-section
  parity closes that trap better than a lone text guard.

## Plan sketch (executable plan to follow)

1. `packages/align`: artifact v2 schema + `buildAlignmentArtifact` +
   browser-safe derive helpers (token times, epubSeq, join, active-token search,
   parity check) with unit tests; per-spine parseMode capture (D10); L1 capture
   self-check on the Alice fixture; consolidate diagnostic types; delete
   `AlignmentResult` v1.
2. bookplayer server: build/cache/serve the artifact from
   `data/bookplayer/cache/` (asset route + ETag); delete request-time VTT parse,
   extraction LRU, join, and `typed-base64`; remove `data/bookplayer/align/`.
3. bookplayer client: consume the artifact; derive rows and highlights from flat
   columns; keep all current UI behavior (virtualized lists, active token, seek,
   follow, show-in-book, locate warning).
4. Measure: artifact raw + on-wire (gzip) size and load/parse time on Alice and
   Crippled God; player stability on the long book. Only a failed budget here
   reopens the encoding question (behind the D4 seam).
5. Locator hardening: section parity wired into `locate`; the L3 locate-coverage
   sweep page (dev-gated); targeted DOM-structure tests — split inline text,
   punctuation, repeated words, xhtml-fallback parses, malformed books where
   available.
6. `apps/align`: emit from the artifact builder; re-baseline reports/ once;
   Daniel's corpus revalidation checks matcher-value stability (spans, gaps,
   metrics), not bytes.

## Non-goals

- Redesigning the matcher.
- Bespoke binary/packed encodings unless step-4 measurement forces one.
- Building a full browser-test harness as part of this refactor.
- Solving every private-book locator failure before the boundary is clean.
- Excerpt search as primary EPUB locator (a parity-failure fallback stays
  possible later, on top of D6).
- Direct VTT serving / `<track>` integration (kept open, not done now).

## Acceptance

- Payload smaller or no larger on the wire than today's transport (Alice
  baseline: 1.28 MB), and the player stays stable and responsive on Crippled
  God; sizes and parse times recorded.
- One versioned artifact contract consumed by `apps/align` and bookplayer; no
  alignment model types left in `apps/bookplayer/src/lib` beyond thin UI state;
  `typed-base64.ts` gone.
- Time-to-active-token is one binary search over a flat derived time column.
- Token → EPUB range resolution is explicit, cached by section, validated by
  section parity, diagnostic on failure.
- L1 capture self-check green in CI; L3 sweep on Alice: 100% of matched EPUB
  tokens resolve to a working, round-tripped epubcfi. Private books: sweep
  coverage measured and failures triaged by section parseMode (mode-mismatch
  sections are predicted risks, not surprises).
- Existing bookplayer behavior preserved: virtualized transcript/alignment
  views, active token highlight, audio seek, EPUB follow, visible locate
  warning.
- Matcher values (spans/gaps/metrics) unchanged across the refactor.

## Rulings recorded (Daniel, 2026-07-08)

- Transport compression is an architecture smell — remove causes, don't
  institutionalize; if any encoding complexity survives, isolate it.
- No backward compat anywhere in this feature; regression baselines in
  `apps/align/reports` and `apps/epub-validate/reports` may re-baseline.
- Transcript unification: no constraint; efficiency decides (→ D9).
- Artifact is not a reports/ concern; cache under `data/bookplayer/cache/`;
  `data/bookplayer/align/` was branch-created, rename away.
