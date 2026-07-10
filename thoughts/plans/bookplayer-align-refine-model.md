# bookplayer-align-refine — AlignmentArtifact v2

Status: DONE (2026-07-09) — implemented, accepted, and validated by Daniel's
full 39-book private-corpus sweep (see Phase 6). Merged to main. Not yet
archived: the sweep evidence spawned the follow-up plan
[bookplayer-locate-hardening.md](bookplayer-locate-hardening.md) (extension
parse-mode fix + /dev/sweep infrastructure); archive both together when that
lands. CLI corpus revalidation folded into the follow-up (its extraction change
re-baselines reports anyway).

Design (authoritative for WHY):
[design/bookplayer-align-refine-model.md](../design/bookplayer-align-refine-model.md)
rev 2 — decisions D1-D9 and Daniel's rulings. This plan is the HOW: phased, with
coding tasks scoped for delegation to lower-power subagent models.

Goal: replace the merged POC alignment model (fat v1 result + per-request join +
base64 wire + separate locator index) with one versioned columnar artifact built
once, cached as pure servable bytes, and consumed by the CLI, the bookplayer
server, and the browser.

Branch: `bookplayer-align-refine` off `main` (prosodio repo).

## Execution model — delegation

- The orchestrator holds this plan, dispatches coding tasks to subagents,
  reviews every diff, runs root `bun run ci`, and commits. Subagents never
  commit, never stage, never touch files outside their task's list, never add
  dependencies.
- Each task below is self-contained: context files to read, files to
  create/change, the exact contract, tests, and done-criteria. A subagent gets:
  this plan's task section verbatim + the design doc path + its file list. If a
  task's instructions conflict with what the subagent finds in the tree, it must
  stop and report, not improvise.
- Model-tier hints per task: `[tier: low]` mechanical moves/deletions/test ports
  — cheapest capable coding model; `[tier: med]` new logic against a spelled-out
  contract — Sonnet-class. Nothing here needs the orchestrator's model for the
  coding itself; the orchestrator reserves judgment for review, wiring disputes,
  and browser verification.
- Subagent report format: files changed, test commands run + results, any
  deviation from the task text.

## Rules (carried from bookplayer/align plans + repo memory)

- Commit at minimum once per phase; root `bun run ci` green before every commit;
  `bun run fmt` first if formatting fails.
- Stage specific files only — never `git add -A`.
- Private corpus (data/transcribe, private books) is dev-time verification only,
  NEVER referenced by tests or CI.
- Tests: `*.test.ts` colocated; staleness tests use file mtimes (`utimesSync`),
  never wall-clock sleeps.
- One active root per bookplayer server run (fixtures | private).
- No backward compat anywhere (Daniel's ruling): v1 shapes are deleted, not
  deprecated; `data/bookplayer/align/` is regenerated-from-zero territory.

## The artifact contract (normative for every task)

`packages/align/src/artifact.ts` defines exactly this; all tasks conform to it.
Wire principle: row objects only for small tables (spans, gaps, spines,
metrics); plain parallel JSON `number[]` columns for cue- and token-scale data.
No base64, no typed arrays on the wire.

```ts
export const ALIGNMENT_ARTIFACT_SCHEMA_VERSION = 2;

export interface AlignmentArtifact {
  schemaVersion: 2;
  features: string[]; // [] for now; reserved for e.g. packed columns
  source: {
    // Codex review #1: the artifact is a browser-served asset — it carries
    // NO filesystem paths. root is the root NAME (fixtures | private).
    // Absolute paths live in the cache key sidecar (server-only) and the
    // CLI report projection (local/private) only.
    root: string;
    base: string;
    vttTiming: "word" | "interpolated";
    vttProvenance: Record<string, unknown> | null;
  };
  config: {
    // carried verbatim from v1 result.ts config block
    normalizationPolicy: string;
    pass1NgramSize: number;
    proofNgramSize: number;
    extraction: {
      includeNonLinearSpineItems: boolean;
      excludedElements: string[];
      domParser: "jsdom";
      parseMode: "xhtml-or-html-fallback"; // T1.1 renames the v1 echo literal
    };
  };
  match: {
    spans: Array<{
      passId: string;
      vttStart: number; // half-open flat-token ranges, both sides
      vttEnd: number;
      epubStart: number;
      epubEnd: number;
      evidence: SpanEvidence; // unchanged from contracts.ts
    }>;
    gaps: Array<{
      vttStart: number;
      vttEnd: number;
      epubStart: number;
      epubEnd: number;
    }>;
    metrics: Metrics; // the v1 metrics block, schema moved verbatim
  };
  vtt: {
    cues: {
      // parallel by cue index; seconds rounded to ms at build
      startSec: number[];
      endSec: number[];
      text: string[]; // raw cue text, shipped once; tokens slice into it
    };
    tokens: {
      // parallel by flat VTT token seq
      cueIndex: number[]; // non-decreasing
      charStart: number[]; // half-open range into cues.text[cueIndex[i]]
      charEnd: number[];
    };
  };
  epub: {
    spines: Array<{
      href: string;
      // Which parser produced this section's tree server-side (design D10).
      // epub.js picks by extension; a mismatch predicts parity failure.
      parseMode: "xhtml" | "html-fallback";
      segPaths: number[][]; // childNodes index path per text segment
      segTextLen: number[]; // parallel to segPaths; UTF-16 length per segment
    }>;
    tokens: {
      // parallel by flat EPUB token seq
      spineIndex: number[]; // non-decreasing
      startSeg: number[];
      startOffset: number[];
      endSeg: number[];
      endOffset: number[];
    };
  };
}
```

Zod: `strictObject` throughout (v1 house style); `superRefine` checks column
invariants — vtt token columns equal length; cue columns equal length; epub
token columns equal length; per spine `segPaths.length === segTextLen.length`;
`cueIndex`/`spineIndex` non-decreasing and in range. Span invariants (Codex
review #3 — `deriveEpubSeq` depends on them): every span non-empty, equal-width
(`vttEnd - vttStart === epubEnd - epubStart`), in bounds for both token tables,
and spans sorted non-overlapping on both axes; gaps in bounds. Determinism rule
carries from v1: no run-instant, hostname, or wall-clock value in the artifact.

Derived, never stored (helpers in Phase 1): per-token time, endSec, matched,
epubSeq, per-cue matchedRatio, gap attribution, coverage labels.

## Phase 0 — branch + docs (orchestrator)

- [ ] Branch `bookplayer-align-refine`; commit this plan + the rev-2 design doc.

## Phase 1 — packages/align: capture + artifact + derive (additive; v1 stays)

CI must be green at phase end with all existing consumers untouched.

### T1.1 Engine data capture `[tier: med]`

Files: `packages/align/src/vtt-sequence.ts` (+test),
`packages/align/src/epub-extract.ts` (+test), new
`packages/align/src/cue-times.ts` (+test).

- `cue-times.ts`: extract the interpolation formula into
  `interpolateWordTimes(startSec: number, endSec: number, count: number): number[]`
  (value `i`: `startSec + ((endSec - startSec) * i) / count`). Pure,
  browser-safe, no imports. `vtt-sequence.ts` switches to it (identical values —
  its test must not change expectations).
- `vtt-sequence.ts`: `VttSequence` gains
  `cues: Array<{ startSec: number; endSec: number; text: string }>` (from the
  same flattened cue list it already walks, times via `vttTimeToSeconds`).
  `VttWord` gains `charStart: number; charEnd: number` — the normalize token's
  `rawStart/rawEnd` (offsets into `cue.text`), currently discarded.
- `epub-extract.ts`: `SpineDocExtraction["dom"]` gains `segTextLen: number[]` —
  `projection.segRanges.map((r) => r.end - r.start)`, parallel to `segPaths`.
  Excluded/empty spine docs get `[]`.
- `epub-extract.ts` parse-mode capture (design D10): `parseContentDocument`
  returns `{ document, mode: "xhtml" | "html-fallback" }` instead of a bare
  Document; `projectVisibleText`'s return gains `parseMode`;
  `SpineDocExtraction` gains `parseMode` (excluded docs: `"xhtml"` by
  convention, they have no content). Export `parseContentDocument` (T1.5 needs
  it). `ExtractionConfig.parseMode` literal changes from `"text/html"` to
  `"xhtml-or-html-fallback"` — it was already inaccurate; this ripples into the
  CLI report config echo (see T2.1 note).
- Tests: extend existing `vtt-sequence.test.ts` (cues present; charStart/End
  slice back to the token's raw text) and `epub-extract.test.ts` (segTextLen
  parallel + values match segment text lengths; parseMode `"xhtml"` for a
  well-formed doc, `"html-fallback"` for a malformed one).
- Done: root CI green; no other file changed.

### T1.2 Artifact schema + builder `[tier: med]`

Files: new `packages/align/src/artifact.ts` (+test); `packages/align/index.ts`
(exports only).

- Implement the normative contract above. Move the v1 metrics/evidence
  sub-schemas from `result.ts` into `artifact.ts` (import them back into
  `result.ts` so v1 still compiles — v1 dies in Phase 5).
- `buildAlignmentArtifact(alignment: BookAlignment, source: ArtifactSource): AlignmentArtifact`
  where `ArtifactSource = { root: string; base: string }` (Codex #1: no
  filesystem paths enter the artifact; `ResultSource` with paths stays a
  report-only type):
  - match block from `alignment.spans/gaps/metrics` (values untouched);
  - vtt block from `alignment.vtt.cues` + per-word `cueIndex/charStart/charEnd`;
    round cue times to ms (`Math.round(x * 1000) / 1000`);
  - epub block from `alignment.epub.spineDocs` (`href`, `parseMode`,
    `dom.segPaths`, `dom.segTextLen`; excluded docs contribute empty tables) +
    per-token locator columns from `dom.tokenLocators` (the same mapping
    `buildEpubLocatorIndex` does today in
    apps/bookplayer/src/lib/epub-locator.ts — read it for reference);
  - `alignmentArtifactSchema.parse(...)` before returning.
- Export from `index.ts`: `ALIGNMENT_ARTIFACT_SCHEMA_VERSION`,
  `alignmentArtifactSchema`, `buildAlignmentArtifact`, type `AlignmentArtifact`.
- Tests: synthetic `BookAlignment` (follow `result.test.ts` fixtures) → build →
  schema round-trip; column invariants violated → parse throws; determinism (two
  builds serialize identically).
- Done: root CI green.

### T1.3 Browser-safe derive helpers `[tier: med]`

Files: new `packages/align/src/artifact-derive.ts` (+test);
`packages/align/browser.ts` + `index.ts` (exports).

No zod, jsdom, or node imports (browser bundle). Types from `artifact.ts` via
`import type` only.

- `deriveTokenTimes(vtt: AlignmentArtifact["vtt"], timing): number[]` — word
  timing: the containing cue's startSec; interpolated: per-cue groups via
  `interpolateWordTimes`. One pass over `cueIndex`.
- `deriveTokenEndTimes(times, vtt): number[]` — a token ends at the next token's
  start within the same cue, clamped `>= own start`; the last token in a cue
  ends at the cue's endSec. (Port the exact semantics of the loop in
  apps/bookplayer/src/lib/alignment.ts `joinAlignedCues`.)
- `deriveEpubSeq(spans, vttTokenCount): number[]` — `-1` unmatched, else
  `epubStart + (seq - vttStart)` (exact-span equal-length invariant).
- `deriveCueAggregates(vtt, epubSeq, gaps): { matchedRatio: number[]; gapEpubTokens: number[]; leadingGapEpubTokens: number }`
  — matchedRatio per cue (0 for zero-token cues); residual-gap EPUB tokens
  attributed to the cue containing the last word before the gap; a gap before
  word 0 is the leading marker. (Port `joinAlignedCues` gap attribution exactly;
  its tests in apps/bookplayer/src/lib/alignment.test.ts are the spec — port the
  relevant cases into the new test file, adapted to columns.)
- `activeTokenAt(startTimes, endTimes, t): number` — binary search over the flat
  half-open intervals, `-1` when none (same contract as
  apps/bookplayer/src/lib/cues.ts `activeIntervalIndex`).
- `epubLocatorAt(epub: AlignmentArtifact["epub"], epubSeq): { spineHref: string; segPaths: number[][]; segTextLen: number[]; loc: DomTokenLocator } | null`
  — bounds-checked column read (the spiritual successor of `epubTokenLocator`).
- `tokenRaw(vtt, seq): string` —
  `cues.text[cueIndex[seq]].slice(charStart, charEnd)`.
- Tests: include one documenting the word-timing collapse (Codex #6): a
  word-timed cue with MULTIPLE normalized tokens gives every token the cue start
  (zero-width intervals except the last) — existing engine policy, now pinned by
  a test rather than assumed. Plus synthetic artifacts covering word +
  interpolated timing, degenerate cues, leading gap, cue-boundary end times,
  out-of-range locator queries.
- Done: root CI green; `browser.ts` compiles with no server-only imports
  (verify: `grep -n "jsdom\|node:" packages/align/src/artifact-derive.ts`
  returns nothing).

### T1.4 Section parity check `[tier: med]`

Files: new `packages/align/src/section-parity.ts` (+test);
`packages/align/browser.ts` (export).

- `checkSectionParity(root: Node, segPaths: number[][], segTextLen: number[]): SectionParityResult`
  where

  ```ts
  type SectionParityResult =
    | { ok: true; segCount: number }
    | {
        ok: false;
        reason:
          "seg-table-mismatch" | "seg-path-failed" | "seg-length-mismatch";
        expectedSegCount: number;
        firstDivergentSeg?: number; // index into segPaths
        detail?: unknown; // DomPathNodeResult or {expected, actual} lengths
      };
  ```

- Implementation: resolve each segPath via the existing `resolveNodeAtPath`
  machinery (refactor: export it from `epub-dom-path.ts` or duplicate the 3-line
  walk — prefer exporting), compare `nodeValue.length` to `segTextLen[i]`; stop
  at first divergence. Also verify the DOM does not contain MORE text segments
  than expected: after the per-segment pass, a count check is sufficient (walk
  is not required — the segPaths table is the contract; extra unreferenced nodes
  are only a mismatch if paths/lengths diverge, so `seg-count-mismatch` is
  reported when `segPaths.length === 0` but the section has text, else covered
  by path/length checks. Keep this pragmatic; document the limitation in the
  module comment).
- Pure DOM API only (module runs in browser); tests use jsdom in the test file
  (allowed — tests are not bundled).
- Tests: parity ok; a mutated DOM (removed node, edited text) → specific
  reason + firstDivergentSeg.
- Done: root CI green.

### T1.5 L1 capture self-check (CI, Alice fixture) `[tier: low]`

Files: new `packages/align/src/epub-extract.roundtrip.test.ts`.

Design context: the DOM-path validation ladder (design section "The DOM path").
L1 proves capture + resolver correctness within one parser; it cannot prove
jsdom↔browser parity (that is L2/L3).

- Test: `extractEpub(aliceEpubBytes(), alignConfig.extraction)`; for each
  included spine doc, re-parse its content with the exported
  `parseContentDocument` (re-read the section HTML the same way extractEpub does
  — if plumbing the raw HTML out is awkward, extend the extraction to keep it in
  a test-only seam or re-open the archive in the test; the subagent picks the
  least invasive option and reports it), then for EVERY token locator:
  `diagnoseRangeFromDomPath(document, segPaths, loc)` must be ok, and
  `normalizeText(range.toString()).text` must equal the token's `norm`. Assert
  zero failures across the whole book; on failure print the first 5 diagnostics
  (spineHref, token index, failure reason).
- Runtime guard: Alice is small (~30k tokens); if the sweep exceeds a few
  seconds, batch per spine doc but do not sample — the point is ALL tokens.
- Done: root CI green, test included in the default `bun test` run (it uses the
  committed fixture, no private data).

Phase 1 commit:
`refine-model P1 — artifact v2 schema, capture, derive, parity, L1 self-check (additive)`.

## Phase 2 — apps/align: report becomes a CLI-owned projection

### T2.1 Move the report projection out of the package `[tier: low]`

Files: `apps/align/lib/report.ts` (+test), `apps/align/align.ts`,
`packages/align/index.ts`, `packages/align/src/result.ts` (shrink only).

- Move from `packages/align/src/result.ts` into `apps/align/lib/report.ts`: the
  report zod schema (`alignmentResultSchema` — rename export `bookReportSchema`,
  type `BookReport`), `buildAlignmentResult` (rename `buildBookReport`),
  `sampleForReview`, `toReviewSample`, `ResultSource` (rename `ReportSource`).
  Adapt imports (`resolveAddresses`, `alignConfig` stay package exports). Keep
  the emitted JSON shape and key order EXACTLY as today. Values are unchanged
  EXCEPT `config.extraction.parseMode`, which T1.1 renamed to
  `"xhtml-or-html-fallback"` — reports/ will diff on that one field and
  re-baseline once (Daniel's no-compat ruling).
- `align.ts`: use `buildBookReport`; behavior otherwise unchanged.
- Package `index.ts`: stop exporting the moved names.
  `packages/align/src/result.ts` now contains nothing bookplayer needs — leave
  whatever `alignment.ts` (bookplayer, still on the old path until Phase 4)
  imports compiling: keep `ALIGNMENT_RESULT_SCHEMA_VERSION` and the
  `AlignmentResult` type re-exported from the moved schema ONLY if the build
  requires it; otherwise delete now. Check with
  `grep -rn "AlignmentResult\|buildAlignmentResult\|ALIGNMENT_RESULT" apps packages --include="*.ts"`
  and report what remains.
- Move/adapt `result.test.ts` alongside (report tests now live in
  `apps/align/lib/report.test.ts`).
- Done: root CI green; `apps/align` fixture run
  (`cd apps/align && bun run align.ts -r fixtures`) writes reports successfully
  (orchestrator runs this, not the subagent, if roots require local assets).

### T2.2 CLI emits the artifact? — NO (ruled)

Artifact is not a reports/ concern (Daniel's Q3 ruling). The CLI does not write
artifacts. Nothing to do; recorded so nobody "helpfully" adds it.

Phase 2 commit: `refine-model P2 — report projection moves to apps/align`.

## Phase 3 — bookplayer server: artifact cache + endpoint (additive)

Old `loadAlignment`/`fetchAlignment` path stays alive until Phase 4 flips the
client; both paths compile and CI stays green.

### T3.1 Artifact cache module `[tier: med]`

Files: new `apps/bookplayer/src/lib/artifact-cache.ts` (+test).

- Layout under `config.dataDir` (which is `data/bookplayer`; note
  `config.cacheFile` already uses `data/bookplayer/cache/` — same dir):
  - `cache/<bookId>.alignment.json` — the artifact, pure servable bytes;
  - `cache/<bookId>.alignment.json.gz` — `Bun.gzipSync` of the same bytes,
    written in the same operation;
  - `cache/<bookId>.alignment.key.json` — staleness sidecar
    `{ schemaVersion: number; vttMtimeMs: number; epubMtimeMs: number }`.
- API:
  - `artifactPaths(config, bookId): { json; gz; key }`;
  - `artifactKey(vttPath, epubPath): ArtifactCacheKey` (stat mtimes +
    `ALIGNMENT_ARTIFACT_SCHEMA_VERSION`);
  - `isArtifactFresh(paths, key): boolean` — sidecar read; corrupt/missing
    sidecar or missing json → false; never throws;
  - `writeArtifactCache(paths, key, artifactJson: string): void` — writes all
    three files (mkdir -p);
  - `loadOrComputeArtifact(config, book): Promise<{ paths; key } | null>` — null
    when vtt or epub missing; fresh → return immediately; else dynamic
    `import("@prosodio/align")`, `alignBook(vttText, epubBytes)`,
    `buildAlignmentArtifact`, `JSON.stringify` (no pretty-print), write-through.
    Single-flight: module-level `Map<string, Promise<...>>` keyed by bookId so
    concurrent requests share one compute; entry removed on settle. Keep the
    `[align] <base>: spans=… in …ms` log line pattern from
    `loadAlignmentResult`.
- Tests (synthetic tiny fixtures, no engine run: inject a fake compute via a
  seam — accept an optional `compute` parameter defaulting to the real one):
  fresh/stale/corrupt sidecar; mtime staleness via `utimesSync`; write produces
  all three files and gz-decompresses back to json; single-flight (two
  concurrent calls, one compute invocation).
- Done: root CI green.

### T3.2 Nitro endpoint `/api/alignment/:bookId` `[tier: med]`

Files: new `apps/bookplayer/server/handlers/alignment.ts`,
`apps/bookplayer/vite.config.ts` (one handler entry),
`apps/bookplayer/src/server/assets.ts` (only if reusing `jsonError` needs an
export tweak — prefer importing from `#/lib/media` like assets.ts does).

- Follow the existing handler pattern (see `server/handlers/vtt.ts` +
  `serveAsset`): validate `BOOK_ID_RE` → 400 `INVALID_BOOK_ID`; resolve book →
  404 `BOOK_NOT_FOUND`; vtt+epub both present else 404 `ASSET_UNAVAILABLE`.
- ETag: `W/"a<schemaVersion>-<vttMtimeMs>-<epubMtimeMs>"`. If-None-Match matches
  → 304 empty. Headers on 200: `Content-Type: application/json`, `ETag`,
  `Cache-Control: no-cache` (revalidate every time; 304 is the fast path).
- Body: `loadOrComputeArtifact(...)`; if the request's `Accept-Encoding`
  includes gzip and the `.gz` file exists, serve those bytes with
  `Content-Encoding: gzip`; else the plain json bytes. Serve from disk (Bun
  file/stream), never `JSON.parse` on the serve path.
- First-compute latency (minutes on big private books) intentionally holds the
  request open — same UX as today's `fetchAlignment`.
- Register in `vite.config.ts` under the existing `handlers` array.
- Tests: handler-level unit tests are awkward under nitro — put the logic worth
  testing (ETag string, freshness → 304 decision, encoding pick) in small pure
  functions inside `artifact-cache.ts` or a `src/lib/artifact-http.ts` and
  unit-test those `[tier: low]`; the handler stays a thin adapter. Endpoint
  smoke happens in Phase 6 browser verification.
- Done: root CI green; dev server serves
  `curl -sI localhost:3000/api/alignment/<aliceId>` → 200 with ETag, second
  request with If-None-Match → 304 (orchestrator verifies).

Phase 3 commit: `refine-model P3 — artifact cache + /api/alignment endpoint`.

## Phase 4 — bookplayer client cutover

One commit; the viewer, route, and reader switch together (their prop types are
entangled). Old server path becomes dead code (deleted in Phase 5).

### T4.1 Client artifact store `[tier: med]`

Files: new `apps/bookplayer/src/lib/alignment-client.ts` (+test).

- `fetchArtifact(bookId, signal): Promise<AlignmentLoadResult>` (Codex #2 — one
  honest contract) where
  `AlignmentLoadResult = { status: "ready"; artifact: AlignmentArtifact } | { status: "unavailable" }`;
  plain `fetch(`/api/alignment/${bookId}`)`; 404 → `unavailable`; other
  non-OK/network failures throw (the viewer's error state catches).
- `prepareAlignment(artifact): PreparedAlignment` — one derive pass calling the
  Phase 1 helpers:

  ```ts
  interface PreparedAlignment {
    artifact: AlignmentArtifact;
    tokenStart: number[]; // deriveTokenTimes
    tokenEnd: number[]; // deriveTokenEndTimes
    epubSeq: number[]; // deriveEpubSeq
    matchedRatio: number[]; // per cue
    gapEpubTokens: number[]; // per cue
    leadingGapEpubTokens: number;
    cueTokenStart: number[]; // first flat token per cue (-1 when none)
    cueTokenCount: number[];
  }
  ```

- Type-only imports from `@prosodio/align/browser` for types; value imports only
  of derive helpers (no zod/jsdom in the client graph — verify with
  `bun run build` in Phase 6).
- Tests: prepare() on a synthetic artifact — spot-check columns, degenerate cue
  (count 0), leading gap.
- Done: root CI green.

### T4.2 AlignmentViewer rework `[tier: med]`

Files: `apps/bookplayer/src/components/AlignmentViewer.tsx`.

Keep: virtualized row list (`useVirtualizer`, overscan, measureElement),
loading/error/unavailable states and messages, summary header line, gap marker
rows, click-to-seek, auto-scroll to active row, `data-testid` attributes, the
`locateFailure` hint.

Change:

- Data: `fetchArtifact` + `prepareAlignment` replace `fetchAlignment` +
  `decodeAlignedCues`. Rows built from cue count + `gapEpubTokens` (a gap row
  after each cue with tokens > 0; leading gap row first).
- Active selection:
  `activeTokenAt(prepared.tokenStart, prepared.tokenEnd, currentTime)` — ONE
  global binary search; active cue =
  `artifact.vtt.tokens.cueIndex[activeToken]`. (Replaces the two-step
  cue-then-token search.)
- Cue row rendering: render the cue's RAW text with per-token styling by slicing
  `cues.text[i]` — for each token in the cue: unstyled slice from the previous
  token's charEnd to this token's charStart (whitespace/ punctuation), then the
  token slice styled matched/unmatched/active (existing class strings). Trailing
  slice after the last token unstyled. Zero-token cues render their full text in
  the unmatched style.
- Callbacks up: replace `AlignedToken` payloads with

  ```ts
  interface ActiveTokenInfo {
    vttSeq: number;
    epubSeq: number | null;
    raw: string; // tokenRaw(vtt, vttSeq) — the locate parity guard text
  }
  ```

  for `onActiveToken` and `onShowInBook` (double-click on a matched token).
  Replace `onPayload` with `onPrepared(prepared: PreparedAlignment)`.

- Summary line: coverage/spans/gaps from `artifact.match.metrics`, timing from
  `artifact.source.vttTiming`, leading gap from prepared.
- Done: compiles; behavior parity checked in Phase 6 (no component unit tests
  exist today; do not invent a component test harness — plan rule).

### T4.3 Route + reader wiring, parity integration `[tier: med]`

Files: `apps/bookplayer/src/routes/player/$bookId.tsx`,
`apps/bookplayer/src/components/EpubReader.tsx`.

- `$bookId.tsx`: hold `PreparedAlignment | null` instead of the old `epubIndex`;
  `showInBook`/`onActiveToken` take `ActiveTokenInfo`, resolve via
  `epubLocatorAt(prepared.artifact.epub, epubSeq)`, pass `expectedRaw: info.raw`
  plus the locator's `segTextLen` through to `locate`.
  Follow/`lastFollowedSeqRef` logic unchanged.
- `EpubReader.tsx`:
  - `EpubTokenLocate` gains `segTextLen: number[]`.
  - `locate()` — after the section document is loaded/cached, run
    `checkSectionParity(document, locator.segPaths, locator.segTextLen)` once
    per section href; cache the result in a small Map beside `sectionCache`.
    Failure → new `LocateResult` reason `"section-parity-failed"` carrying the
    parity result in `details`; console.warn ONCE per section (subsequent
    locates return the cached failure silently). Success → proceed exactly as
    today (path resolve, text guard, cfiFromRange, display, highlight).
  - Section cache invalidation: parity cache lives and dies with `sectionCache`
    entries (evict together).
- AlignmentViewer's `locateFailure` hint renders the new reason (the existing
  generic message is fine; reason string shows in the title attribute).
- Done: root CI green; type-check catches any missed callback signature.

### T4.4 L3 locate-coverage sweep page (dev-gated) `[tier: med]`

Files: new `apps/bookplayer/src/routes/dev.locate.$bookId.tsx`, new
`apps/bookplayer/src/lib/locate-sweep.ts`.

Design context: validation ladder L3 (design section "The DOM path") — the
empirical answer to "does EVERY matched EPUB token produce a WORKING epubcfi in
the real browser through the real epub.js". Dev tool, never CI.

- Route is dev-gated: render "not available" unless `import.meta.env.DEV`.
- `locate-sweep.ts` (browser-only module, dynamic `import("epubjs")` like
  EpubReader):
  - `sweepBook(artifact: AlignmentArtifact, epubUrl: string, onProgress?): Promise<SweepReport>`
    (as built: the sweep derives its vttSeq/expected-text lookup from spans
    directly; no PreparedAlignment parameter);
  - matched EPUB token set = union of `[epubStart, epubEnd)` over
    `artifact.match.spans`, grouped by `spineIndex`;
  - per section with matched tokens: find the epub.js section by href suffix
    match (same rule as EpubReader.locate), `section.load`, run
    `checkSectionParity`, then for every matched token in the section:
    1. `diagnoseRangeFromDomPath(document, segPaths, loc)` → ok?
    2. text guard: `normalizeText(range.toString()).text` equals the matched VTT
       token's norm-equivalent — use `normalizeText(tokenRaw(vtt, vttSeq)).text`
       for the span-mapped VTT seq (epubSeq → vttSeq via the span, or precompute
       the inverse of `deriveEpubSeq`);
    3. `section.cfiFromRange(range)` → string;
    4. round-trip: `new EpubCFI(cfi)` (import from `epubjs`),
       `.toRange( document)` → non-null and its normalized text equals step 2's.
  - `SweepReport`:
    `{ bookId, totals: { sections, tokens, ok, failed }, sections: Array<{ href, parseMode, extensionPredictedMode, parity: SectionParityResult, tokens, ok, failures: Array<{ epubSeq, step: "path" | "text" | "cfi" | "roundtrip", detail: unknown }> /* capped at 20 per section */ }> }`;
    `extensionPredictedMode` from the href extension (`.xhtml`/`.xht` → xhtml,
    `.html`/`.htm` → html) so mode-mismatch sections are visibly PREDICTED
    risks.
  - `section.unload()` after each section (memory; long books).
- Route page: fetch + prepare (reuse T4.1), run sweep with a progress line,
  render totals + a per-section table (href, parseMode, predicted mode, parity,
  ok/total, first failures), and set `window.__locateSweepReport = report` for
  automation (orchestrator reads it via the preview tools in Phase 6).
- Done: root CI green (module compiles; no component test — the page IS the test
  rig). Sweep of Alice completes in the browser without errors (orchestrator
  verifies in Phase 6).

Phase 4 commit:
`refine-model P4 — client consumes artifact v2; section parity in locate; L3 sweep page`.

## Phase 5 — deletions, exports, docs

### T5.1 Delete the old model `[tier: low]`

Files (delete): `apps/bookplayer/src/lib/alignment.ts`, `alignment.test.ts`,
`alignment-wire.ts`, `epub-locator.ts`, `epub-locator.test.ts`,
`typed-base64.ts`, `typed-base64.test.ts`; `packages/align/src/result.ts`,
`result.test.ts` (whatever T2.1 left). Files (edit):
`apps/bookplayer/src/server/library.ts` (remove `fetchAlignment` +
`loadAlignment` import), `packages/align/index.ts` (remove dead exports).

- Sweep before finishing:
  `grep -rn "alignment-wire\|epub-locator\|typed-base64\|AlignmentPayload\|AlignedCue\|decodeAlignedCues\|fetchAlignment\|AlignmentResult\|buildAlignmentResult" apps packages --include="*.ts" --include="*.tsx"`
  must return nothing (excluding thoughts/). Report the grep output.
- Delete stale cache dir note: `data/bookplayer/align/` is gitignored; remove it
  locally (`rm -rf data/bookplayer/align`) — call it out in the report,
  orchestrator executes.
- Done: root CI green.

### T5.2 Docs `[tier: low]`

Files: `apps/bookplayer/README.md`, `apps/align/README.md`,
`docs/FILE-LAYOUT.md` (if it names the deleted modules or the align cache dir),
`thoughts/BACKLOG.md`.

- Bookplayer README: alignment section now describes the artifact endpoint
  (`/api/alignment/:bookId`, ETag/304, gzip variant), the
  `data/bookplayer/cache/<bookId>.alignment.{json,json.gz,key.json}` layout, and
  derive-in-client model. Terse rule-sheet style.
- BACKLOG: tick/retire `bookplayer-epub-locator-hardening` items superseded by
  section parity; add `alignment-artifact-packed-columns` (behind D4 seam, only
  if Phase 6 measurement fails) and `bookplayer-serve-vtt-track` (direct VTT to
  media element — kept open).
- Done: docs match the tree; no prose bloat.

Phase 5 commit: `refine-model P5 — delete v1 model + wire modules; docs`.

## Phase 6 — measurement + acceptance (orchestrator + Daniel; no delegation)

- [ ] Sizes: for Alice (fixtures) and Crippled God (private, dev-time only)
      record in this plan: artifact json bytes, gz bytes, client `JSON.parse` +
      `prepareAlignment` time (console.time in a scratch snippet or the browser
      console). Budget: wire ≤ old transport (Alice old baseline 1.28 MB),
      parse+prepare well under a second on the long book. A failed budget
      reopens D4 (packed columns behind the codec seam) as a NEW plan item — do
      not improvise encoding inline. PARTIAL 2026-07-09 (Alice): 875,372 B raw
      json → 166,746 B gzip on the wire (old baseline 1.28 MB → ~8x smaller);
      first compute+serve 0.9s, cached serve 3.5ms, If-None-Match → 304.
      Crippled God: Daniel, dev-time.
- [ ] Browser acceptance on Alice (fixtures root, preview server): panel renders
      match/partial/unmatched styling with punctuation-intact cue text; at least
      one gap marker; click seeks; active token follows playback; double-click
      show-in-book highlights in the reader; locate warning appears on a forced
      failure (dev-tools induced) with a single console report; 304 served on
      reload (network tab). DONE 2026-07-09: verified live — punctuation-intact
      rendering, leading + interior gap markers, click-to-seek (26.94s), active
      token "tired" correct at 30s, reader follow highlight painted via the
      parity gate, zero console warnings. 304: browser reload revalidated
      (transferSize 300 B vs 166,746 B encoded body — headers only). Forced
      failure: corrupted a cached artifact's segTextLen (served from a second
      origin to defeat the browser's HTTP cache, which otherwise correctly kept
      serving the intact cached body — two layers of caching resisted the
      sabotage before the corrupt bytes got through) → UI hint "EPUB location
      failed: section-parity-failed", and two further locates in the bad section
      produced ZERO additional console warnings (measured with a console.warn
      wrapper). Known dev nuance: React StrictMode double-mount computes parity
      ~2x per PAGE LOAD (bounded, dev-only); the per-token spam the design
      targeted is confirmed suppressed. Cache restored (regenerates on next
      request).
- [x] L3 sweep on Alice (`/dev/locate/790133709c8f`): 100% of matched EPUB
      tokens produce a working, round-tripped epubcfi (Alice is all-.xhtml, both
      parsers take the XML path — anything less than 100% is a bug, not book
      noise). RESULT 2026-07-09: 9,343/9,343 tokens ok across 2 sections with
      matched spans (9,338 + 5; parity ok, 1005 + 73 segments; parseMode xhtml =
      predicted for both). Known cosmetic issue: epub.js emits internal
      `substitute` TypeErrors to the console during the sweep's renderless
      section.load (absent in the real player, which has a rendition); results
      unaffected — noted for BACKLOG.
- [x] Daniel, private corpus — DONE 2026-07-09, and beyond the ask: Daniel built
      an out-of-repo bun+playwright driver over `/dev/locate/:bookId` and swept
      the ENTIRE 39-book private corpus (~5 min). Results: 12 books fully clean,
      5 partial, 22 zero-ok. Analysis of the full per-section detail (8 MB
      results JSON): every failing section — 638 of 849 — is `seg-path-failed`
      at segment 0 with `parseMode: "xhtml"` vs
      `extensionPredictedMode: "html"`; zero length/text/cfi/roundtrip failures
      anywhere. Exactly the D10 mode-mismatch class (.html spine files: epub.js
      parses HTML by extension, server parsed XML by content); partial books are
      mixed-extension. Artifact load/parse at 350k+ token scale (Crippled God)
      worked in-browser during the sweep. Sweep page ruling: KEEP — "exactly
      what we need going forth." Fix + sweep infrastructure: plan
      [bookplayer-locate-hardening.md](bookplayer-locate-hardening.md).
- [ ] Daniel, CLI revalidation: FOLDED into bookplayer-locate-hardening — the
      extension-driven parse-mode fix changes extraction input on .html books,
      so reports re-baseline there once; a standalone revalidation of this
      refactor alone would be immediately superseded.
- [ ] Roll design doc status to "implemented"; this plan → archive after
      Daniel's validation.

## Task→file ownership map (for parallel dispatch)

Tasks safe to run in parallel (disjoint files): T1.1+T1.4 | T1.2+T1.5 after T1.1
| T1.3 after T1.2 | T2.1 after T1.2 | T3.1 after T1.2; T3.2 after T3.1 | T4.1
after T1.3; T4.2+T4.3+T4.4 after T4.1 | T5.x after Phase 4.

## Acceptance (from design rev 2)

- Payload smaller or no larger on the wire than the old transport; player stable
  on Crippled God; sizes and parse times recorded above.
- One versioned artifact contract; no alignment model types left in
  `apps/bookplayer/src/lib` beyond thin UI state; `typed-base64.ts` gone.
- Time-to-active-token = one binary search over a flat derived time column.
- Token → EPUB range resolution explicit, cached by section, validated by
  section parity, diagnostic on failure — once per cause.
- Validation ladder in place: L1 self-check green in CI; L3 sweep 100% on Alice;
  private-book sweep coverage recorded with failures triaged by section
  parseMode.
- Existing bookplayer behavior preserved (virtualized lists, active token, seek,
  follow, show-in-book, locate warning).
- Matcher values (spans/gaps/metrics) unchanged (modulo the one
  `config.extraction.parseMode` echo field, T2.1).
