# bookplayer-align — The Prosodio Bookplayer - Alignment Visualisation

Status: CORRECTIVE REVISION — Phases 0-6 shipped a working visualization but on
a broken synchronization model (see "Corrective revision" below). Phase 7 is a
browser-side, compact-transport POC that proves exact token-level sync; the full
data-model rework is scoped in "Global review (deferred)" and gated on the POC.
Not mergeable until the POC lands and the global review is decided.

Goal: Visualize the epub/vtt alignment in the bookplayer UI

Addresses BACKLOG `bookplayer-alignment-layout`; builds on the bookplayer
decision record ([plans/archive/bookplayer.md](archive/bookplayer.md)) and the
epoch 4 alignment design
([design/epoch4-alignment-design.md](../design/epoch4-alignment-design.md)).

## Feasibility

Feasible with no new algorithms and no schema invention. Evidence:

- `AlignmentResult` (apps/align/lib/result.ts) is already pure serialized data —
  Zod-validated, deterministic, no DOM/CFI handles.
- `VttWord` (apps/align/lib/vtt-sequence.ts) carries `cueIndex` + `wordIndex`,
  so accepted spans (VTT token ranges) resolve to individual words inside each
  transcript cue. Matches are word-by-word, and the view-model preserves that
  resolution (see wire types).
- bookplayer and align share the same root-set semantics (fixtures | private,
  basename join), so locating the VTT+EPUB pair for a `bookId` reuses
  bookplayer's existing `assetPath`.
- The engine extraction (`packages/align`) is pure code motion:
  `apps/align/lib/` has no CLI/report/discovery coupling except `config.ts`,
  which splits cleanly (algorithm parameters → package, roots/paths → CLI).

Main risk: jsdom + epub-ts inside the vite/nitro server bundle — server-only
heavyweights. Mitigation: dynamic `import()` inside the server function; nitro
externals as fallback. Spiked first in Phase 2 before any UI work.

Second risk: alignment compute time for large private books (minutes-scale worst
case). Mitigation: compute once, cache the `AlignmentResult` JSON under
gitignored `data/bookplayer/align/`; loading state in the panel while computing.
The cue join itself (parse VTT + sweep spans) is cheap and runs per request.

## Decisions (ruled by Daniel, 2026-07-05)

- D1 keep `apps/align/` directory path; npm name becomes `@prosodio/align-cli`;
  new `packages/align` takes `@prosodio/align`. The dir rename is TECHNICAL
  DEBT: BACKLOG item `align-cli-rename` (dir rename + full reference sweep),
  optional within this branch, default deferred.
- D2 compute in bookplayer (decided). Possible later: compute browser-side — so
  `packages/align` keeps IO at the edges (text/paths in, data out; jsdom
  confined to epub extraction) but no browser build is engineered now.
- D3 alignment panel toggles, DEFAULT ON (for now). Desktop: reader band splits
  50%-50% horizontally — EpubReader | AlignmentViewer. Mobile (<sm): flow
  vertically — reader over viewer, each roughly half the band; the toggle can
  still hide the viewer entirely.
- D4 wire type is a cue-joined view-model with WORD-LEVEL runs (matches are
  word-by-word, not whole-cue). AlignmentViewer tracks audio playback exactly
  like Transcript (active cue follows currentTime, click seeks, auto-scroll);
  the shared cue logic is extracted, not duplicated.
- D5 (new phase, last): position the text in the ebook — the other join.
  Clicking a matched cue navigates the EpubReader to the corresponding EPUB
  location. Done after the panel works end-to-end.
- D6 (ruled by Daniel after Phase 4 demo): the normal flow syncs all three views
  as audio plays — play position → Transcript highlight+scroll → AlignmentViewer
  highlight+scroll → EpubReader highlight+scroll. Reader follow is a toggle,
  default ON; manual reader navigation (page, chapter, search) disengages it so
  the reader never fights the user. v1 limitation: follow is driven by the
  AlignmentViewer's active cue, so it operates while the alignment panel is open
  (it is open by default, D3).

## Design

### packages/align (engine) / apps/align (CLI)

File moves (`git mv`, pure motion — byte-identical reports is the contract):

- `apps/align/lib/{contracts,normalize,vtt-sequence,epub-extract,exact-pass, lis,reconcile,metrics,align-book,result}.ts` +
  their `*.test.ts` → `packages/align/src/`.
- Config split: algorithm parameters (`passes`, `normalizationPolicy`,
  `extraction`, `metrics` thresholds) move to `packages/align/src/config.ts`
  keeping the exported name `config` and identical values (minimal diff, no
  serialization change). Paths (`appDir`, `reportsDir`, `fixturesDir`, `alice*`,
  `roots`) stay in `apps/align/lib/config.ts`.
- `packages/align/package.json`: name `@prosodio/align`, deps
  `@likecoin/epub-ts`, `jsdom` (+ `@types/jsdom`), `zod` (catalog),
  `@prosodio/vtt` (workspace); `check` script matching `packages/vtt` so the
  root member-check picks it up. Exports: `alignBook`, `AlignOptions`,
  `buildAlignmentResult`, `alignmentResultSchema`, `AlignmentResult`,
  `ALIGNMENT_RESULT_SCHEMA_VERSION`, `buildVttSequence`, `VttSequence`,
  `VttWord`, contracts types.
- `apps/align` keeps `align.ts` (CLI), `lib/discovery.ts`, `lib/report.ts`,
  `lib/config.ts` (paths), `test/` (fixture-fed integration tests, imports
  updated to `@prosodio/align`), README (updated). npm name
  `@prosodio/align-cli`; deps shrink to `@prosodio/align` (workspace), `yargs`
  (+ types).
- Verify imports by grep before moving: every `./config.ts` import site gets
  routed to the surviving half; no import may cross app → package internals
  (only the package root export).
- Gate: root `bun run ci` green AND `bun run align -- -r fixtures` leaves the
  nested `reports/` repo clean (`git status`) — byte-identical.

### bookplayer server

- `apps/bookplayer` adds workspace dep `@prosodio/align`.
- `fetchAlignment(bookId)` server function (src/server/library.ts pattern),
  logic in `src/lib/alignment.ts`:
  1. Resolve vtt+epub via `assetPath`; either missing →
     `{ status: "unavailable" }` (explicit UI state, like transcripts).
  2. Load cache `data/bookplayer/align/<bookId>.json`:
     `{ key: { schemaVersion, vttMtimeMs, epubMtimeMs }, result }`. Key mismatch
     or missing → compute `alignBook` + `buildAlignmentResult` (dynamic import
     of `@prosodio/align` so jsdom stays out of any client graph),
     write-through.
  3. Join (pure, unit-tested, in `src/lib/alignment.ts`):
     - `buildVttSequence(vttText)` → words with `cueIndex`/`raw`/`timeSec`
       (cheap; runs every request — only the alignment compute is cached).
     - Sweep sorted spans + words (two pointers): a word is matched iff covered
       by an accepted span.
     - Group words by `cueIndex`; consecutive same-status words collapse into
       runs (`text` = raws joined by spaces).
     - Cue start/end seconds come from the same flattened cue list the words
       were built from (identical flattening to `loadTranscript`).
     - `gapEpubTokens`: each residual gap's `epubEnd - epubStart` attributed to
       the cue containing the last matched word before the gap
       (`gap.vttStart - 1`); a gap at stream start becomes the summary's
       `leadingGapEpubTokens` (marker before the first cue).
     - Degenerate cue (all words normalized away) → single unmatched run from
       the raw cue text.

Wire types (server-defined, imported as types by the client):

```ts
interface CueRun {
  text: string;
  matched: boolean;
}
interface AlignedCue {
  startSec: number;
  endSec: number;
  runs: Array<CueRun>;
  matchedRatio: number; // matched words / words, 0..1
  gapEpubTokens: number; // epub tokens never narrated, following this cue
}
interface AlignmentSummary {
  vttCoverage: number;
  epubCoverage: number;
  spanCount: number;
  gapCount: number;
  timing: "word" | "interpolated";
  leadingGapEpubTokens: number;
}
type AlignmentPayload =
  | { status: "unavailable" }
  | { status: "ready"; summary: AlignmentSummary; cues: Array<AlignedCue> };
```

### AlignmentViewer (client)

- Sibling of `Transcript.tsx`; the shared cue machinery (`activeCueIndex` binary
  search, auto-scroll ref pattern) is extracted to `src/lib/cues.ts` and reused
  by BOTH components — AlignmentViewer and Transcript share a lot, by design.
- Row rendering: `[m:ss]` timecode + the cue's runs inline — matched runs normal
  weight, unmatched runs visibly distinct (red tint — narration not found in the
  book). Word-level: a single cue can mix matched and unmatched runs. Row
  background from `matchedRatio` (quiet when fully matched) + cyan active-cue
  treatment matching Transcript.
- After a cue with `gapEpubTokens > 0`, an inline marker row:
  `⧉ ~N words in book not narrated` (symbol subject to taste);
  `leadingGapEpubTokens` renders the same marker before the first cue.
- Header line: coverage summary (`vtt 94% · epub 91% · 312 spans · 45 gaps`) +
  timing source when interpolated.
- States: loading ("computing alignment…" — first run can take a while), error,
  unavailable, ready.
- Behavior: active cue follows `currentTime`, click seeks audio, auto-scroll
  keeps the active cue visible — exactly like Transcript.
- Layout in `player/$bookId.tsx`: `alignOpen` state, DEFAULT true when
  `book.hasEpub && book.hasVtt` (else no panel, no toggle). Top-bar toggle
  button. Open: desktop `main` = flex row, two `min-w-0 flex-1` panes
  (EpubReader | AlignmentViewer); mobile (below `sm`) = flex col, reader over
  viewer, each `min-h-0 flex-1`. Closed: reader full-band (today's layout).

### EPUB positioning join (D5, last)

- Server: `fetchEpubAnchor({ bookId, cueIndex })` → the cue's first matched word
  → its covering span → `addresses[0]` → return `{ spineHref, excerpt }`,
  excerpt = the span's raw EPUB text slice (~10 words, via the extraction's
  rawStart/rawEnd mapping — same technique as `reviewSamples.epubText`).
  Requires re-running `extractEpub` (in-memory LRU of 1 per server — the same
  book stays hot).
- Client: `ReaderController` gains `locate(href, excerpt)` — `goTo(href)` then
  reuse the existing section-search machinery scoped to that section to find +
  highlight the excerpt (search already produces CFIs and highlights; this
  reuses it verbatim). Fallback when the excerpt isn't found: plain `goTo(href)`
  — landing in the right chapter is already useful.
- UI: a small "show in book" affordance on matched cue rows.
- Exploratory: if excerpt-search proves flaky, ship the `goTo(href)` fallback
  and record the refinement as a BACKLOG item.

## Phases

- [x] Phase 0 — commit plan to main; branch `bookplayer-align`.
- [x] Phase 1 — extract `packages/align`; `apps/align` → CLI-only
      (`@prosodio/align-cli`, dir unchanged per D1); config split; test imports
      updated; BACKLOG gains `align-cli-rename` (debt, deferred). Gate: root CI
      green + fixtures align run byte-identical (clean `reports/` git status).
- [x] Phase 2 — bookplayer plumbing: workspace dep; SPIKE jsdom/epub-ts loading
      inside a server function under `bun run dev` (risk gate — do this before
      writing the rest); `fetchAlignment` + disk cache + word-run cue join with
      unit tests (synthetic spans/cues; cache staleness via mtime manipulation,
      not sleeps).
- [x] Phase 3 — AlignmentViewer + shared `src/lib/cues.ts` (Transcript
      refactored onto it) + split layout with default-on toggle; word-level run
      rendering; gap markers; playback tracking. Browser-verified on Alice
      (fixtures root), desktop + mobile viewports.
- [x] Phase 4 — EPUB positioning join (D5): `fetchEpubAnchor` + reader
      `locate` + affordance; fallback `goTo(href)` acceptable. Browser-verified
      on Alice matched cues.
- [x] Phase 5 — follow mode (D6): AlignmentViewer reports its active cue up; the
      player locates the reader on matched-cue changes (throttled to cue
      transitions, skipping repeats); top-bar follow toggle (default on),
      auto-disengaged by manual reader navigation. Browser-verified on Alice.
- [x] Phase 6 — acceptance + docs: fixtures acceptance recorded (Alice is the
      deliberately hard mismatch case — abridged EPUB vs full narration, so
      mixed runs and gap markers show prominently); private dev-time spot-check
      on a high-coverage book (NOT in CI); READMEs + docs/FILE-LAYOUT.md (new
      `data/bookplayer/align/` cache dir) + BACKLOG updates; plan → archive
      after Daniel's validation.

Rules carried from bookplayer: commit at minimum every phase; root `bun run ci`
before every commit; private corpus for dev-time verification only, never CI;
one active root per server run.

## Acceptance

- Fixtures (CI-safe): Alice player opens with the alignment panel visible by
  default; rows show word-level matched/unmatched runs (Alice guarantees mixed
  rows) and at least one gap marker; clicking a cue seeks audio; active cue
  tracks playback; toggle collapses to today's full-band reader; mobile stacks
  vertically with both panes usable; "show in book" lands the reader in the
  right place on a matched cue.
- Private (dev-time only): a high-coverage book renders mostly matched runs;
  tracking follows playback across the panel.
- Root CI green; no private paths or private-corpus dependence in any test.

### Acceptance evidence (2026-07-05)

- Fixtures (Alice, browser-verified via Claude Preview, desktop + 390x844):
  - Panel default-on: 2524 cue rows, 333 mixed word-level rows (e.g. first cue:
    "Chapter 1" unmatched / "of Alice s Adventures in Wonderland" matched), 252
    gap markers incl. the leading `⧉ ~4 words` marker; header
    `narration 34% · book 70% · 440 spans · 441 gaps` — identical numbers to the
    align CLI.
  - Click-seek (26.94s), active-cue tracking, toggle off/on (reader reclaims
    full width), mobile vertical stack all verified.
  - Show-in-book: reader lands on "I—DOWN THE RABBIT-HOLE" with "Alice was
    beginning to get very tired of" highlighted across the small-caps drop-cap
    markup (`bp-align-hl` range CFI, in-bounds).
  - Follow mode: seek to a matched cue auto-locates the reader; next cue moves
    the highlight; manual paging disengages (reader stays put during playback);
    re-enabling locates immediately.
- Private (dev-time, NOT CI): Use of Weapons — vtt 92% / epub 93% coverage, 4785
  spans, engine compute 1364ms (cache write-through, warm reads after); 9113
  cues: 87% mostly-matched (>=0.8), 1% unmatched. The compute-time risk retired:
  seconds, not minutes, even for a full-length novel.
- Engine extraction gate held: root CI green throughout; fixtures alignment
  report byte-identical after the packages/align move.

## Corrective revision (2026-07-05, after Phase 6 demo)

The Phase 0-6 visualization renders correctly but is built on the wrong
synchronization model. Three defects, one root cause. Full analysis:
[bookplayer-align-bad-design.md](bookplayer-align-bad-design.md) (post-mortem
authored on the rejected spike branch `bookplayer-align-badfix`, preserved here
as the authoritative problem statement).

Root cause: the engine's job is to produce normalized text for MATCHING while
preserving, per token, a durable INDEX back into each source's native,
un-normalized structure. We produced the match but discarded/mangled the native
index; every symptom below follows.

- P1 — sync is cue-based, must be token-based. `updatetime` highlights the whole
  active cue via `activeCueIndex`. We matched tokens; the active unit at time
  `t` is the single token whose interpolated time interval contains `t`. Cue
  highlighting throws away the resolution the matcher computed.
- P2 — the "index" is a flat/derived offset, not a native address.
  - VTT: spans carry `vttStart/vttEnd`, half-open offsets into a flattened
    CROSS-CUE normalized word stream. The native address is
    `{ cueIndex, start, end }` (UTF-16 offsets into the cue's raw text) plus the
    token's own interpolated time interval. We flattened away cue identity and
    per-token time, then reconstructed cues by re-grouping — backwards.
  - EPUB: spans carry `epubStart/epubEnd` and the derived `EpubTextAddress`
    `start/end` are CHARACTER OFFSETS INTO A FLATTENED normalized string per
    spine doc — not a DOM position. The native address is a DOM child-node path
    (an epubcfi-lite: `childNodes` indices from a defined root to a Text node) +
    intra-node offset, captured DURING extraction traversal. We stored an offset
    into a projection we then destroyed, forcing later re-derivation.
- P3 — the engine is not browser-runnable. `extractEpub` does
  `await Bun.file(epubPath).arrayBuffer()` then `new Book(bytes)`
  (epub-extract.ts) — a Bun-only, filesystem-only read. The bytes are the only
  thing needed; the function must take `bytes: ArrayBuffer` as a PARAMETER
  (server passes `readFileSync`'d bytes; the browser passes bytes epub.js
  already holds). This is the "IO at the edges" of D2, which we violated.

Lesson from the badfix (what NOT to do): it proved the mechanics but
reconstructed positioning by expanding a per-token UI model ON THE SERVER —
134,322 VTT tokens became a 31 MB JSON object (~60 MB over transport). The
resolution work belongs in the BROWSER (which already owns the parsed section
DOM), fed by COMPACT coordinates, resolved once and cached.

### D7 — synchronization is token-based, resolved browser-side, compact wire

- Playback sync keys on the active TOKEN (its interpolated time interval), not
  the cue or span. Cues remain presentation groups.
- Every rendered token carries its VTT identity, its time interval, and (when
  matched) its EPUB sequence offset. EPUB positioning resolves that token's
  address against epub.js's DOM in the BROWSER, generating the CFI locally.
- The server ships COMPACT columnar/typed-array coordinates, never a per-token
  JSON UI model. Excerpt-search is not an alignment locator and is retired from
  the follow path.

## Phase 7 — POC: exact token-level sync (browser-side, compact)

Goal: prove, end to end, that a single active token highlights by its own time
interval AND locates the same token in the EPUB — browser-side, from compact
data, fast, cached — WITHOUT the badfix's server-expanded payload. "Even using
the current (imperfect) address" this must be possible; the true native-index
rework is deferred to the global review. Salvage the good parts of the badfix
(`dom-text.ts` browser projection; compact base64 typed-array epub index;
`activeTokenIndex`); drop the fat per-token wire model.

- [ ] 7a — engine IO-fix (P3): `extractEpub(bytes: ArrayBuffer, config)` and
      `alignBook(vttText, epubBytes, opts)` take bytes; the CLI + server
      wrappers read the file (`readFileSync`/`Bun.file`) and pass bytes. Gate:
      root CI green AND fixtures alignment report byte-identical.
- [ ] 7b — token identity through the wire (P1/P2, POC level): VTT tokens keep
      `{ cueIndex, rawStart, rawEnd, startSec, endSec }`; matched tokens carry
      `epubSeq`. EPUB keeps the normalized address per token for now (resolved
      browser-side), documented as POC-limited.
- [ ] 7c — compact transport: ship the epub address index AND the VTT token
      table as base64 typed arrays (columnar), not fat objects. Hard budget:
      total `fetchAlignment` payload stays single-digit MB on Use of Weapons
      (baseline ~2 MB), NOT tens of MB. Measure and record.
- [x] 7d — active-token selection (P1): `activeTokenIndex(tokens, t)` by time
      interval; the viewer highlights the active token; follow drives off token
      transitions (not cue transitions). DONE 2026-07-05: `AlignedCue.tokens`
      carry per-token interpolated `{startSec,endSec,matched}`;
      `activeTokenIndex` selects the active word within the active cue;
      AlignmentViewer highlights exactly one token. Verified on Alice: at
      27.2s/28.2s/29.4s the lone highlight was "Alice"/"beginning"/"very" (one
      token at a time). Follow-path rewrite (token- not cue-driven) lands with
      7e. NOTE: the per-token wire is not yet compacted (7c) — fine on Alice;
      required before big books.
- [ ] 7e — browser-side EPUB locate: adopt `dom-text.ts` projection; resolve the
      token address to a DOM `Range` in the loaded section →
      `section.cfiFromRange` → `annotations.highlight("bp-align-hl", …)`; cache
      the per-section projection (`normalizedDomText` once per load). No server
      DOM reconstruction.
- [ ] 7f — verify on Alice (fixtures): active token highlights in the panel and
      in the reader as audio plays; payload measured; the projection-parity
      limitation (browser re-normalization assumed identical to the server's
      jsdom projection) recorded as the POC's known risk.

### P2 proposal — EPUB native index (awaiting Daniel's nod before 7e/7c)

The badfix's `projectDomText` is a hand-rolled `textContent` walk with an offset
trace bolted on, then RE-RUN in the browser and assumed identical to the server.
Re-deriving position instead of capturing it. Proposal: capture the DOM position
ONCE, during the authoritative extraction traversal, as an epub-CFI-lite;
resolve it in the browser by walking the DOM — no re-normalization, no text
re-projection, no excerpt search.

- Native locator, captured during extraction (server, jsdom): for each EPUB
  token, its DOM range endpoints —
  `{ start: {path: number[], offset}, end: {path: number[], offset} }`, where
  `path` is the `childNodes` index chain from a defined content-document root to
  a Text node and `offset` is a UTF-16 offset in it. Handles inline splits
  (`<em>hel</em>lo` → one token, two nodes) and is exactly what a CFI encodes.
- Compact wire (fixes the 31 MB bloat): per spine, a SEGMENT TABLE of the
  distinct Text-node paths in document order (segments number in the thousands,
  tokens in the 100k+); per token, four typed-array columns
  `(startSeg, startOffset, endSeg, endOffset)` as base64 — no fat per-token
  JSON. For an exact span, VTT token i ↔ EPUB token `epubStart+i`, so only the
  EPUB token table (indexed by `epubSeq`) is needed.
- Browser resolution (EpubReader, once per section load, cached): walk each
  segment path against the loaded section DOM → live Text node; per token,
  `createRange(nodes[startSeg], startOffset .. nodes[endSeg], endOffset)` →
  `section.cfiFromRange(range)` → `annotations.highlight`. A childNodes walk +
  Range, not a normalization.
- Parity, handled honestly (the real risk): EPUB content docs are XHTML; jsdom
  (server) and the browser both parse XML deterministically, so child-node paths
  line up for well-formed XHTML (the common case). Guards, in order: (1)
  per-token assertion `normalizeText(range.toString()) === token.norm` — a
  mismatch skips the highlight (loud), never mis-highlights; (2) a per-spine
  structural checksum (child counts) that fails a whole section fast; (3)
  HTML-fallback docs (strict-XHTML failures) are flagged and degrade to
  no-highlight. This is stricter than the badfix, which silently trusted
  re-projection.
- Why not just keep the normalized-offset address + `dom-text.ts`? Because it
  bakes in the projection-parity ASSUMPTION as the load-bearing mechanism.
  Capturing the path during extraction removes the assumption from the hot path;
  the assertion becomes a guard, not the design.

Open question for Daniel: adopt this child-node-path index NOW as 7e (a bit more
extraction work, but it is the real answer and avoids building 7e twice), OR
ship 7e first on the imperfect normalized-offset address (faster POC, throwaway)
and switch to child-node paths in the global review? Recommendation: do it now —
the extraction already traverses the DOM; capturing the path there is cheap and
it is the design we will keep.

## Global review (deferred — decided WITH Daniel after the POC proves out)

The POC keeps the imperfect address; the real fix (scope, not yet scheduled):

- EPUB native index: capture a DOM child-node-path range per token DURING
  extraction traversal (kills the projection-parity assumption); the server
  serializes that, the browser walks it — no re-normalization.
- VTT native index: first-class serialized `{ cueIndex, start, end }` cue-text
  ranges on every token, not reconstructed from a flattened stream.
- Fully IO-free, browser-runnable `@prosodio/align` (P3 finished end to end).
- A serialization contract that separates (1) matcher coordinates, (2) native
  source indices, (3) disposable presentation — per the acceptance criteria in
  [bookplayer-align-bad-design.md](bookplayer-align-bad-design.md).
- Parser-parity: make server/browser tree compatibility explicit and TESTED;
  drift must fail loudly, never silently highlight a plausible repeated word.

## My Validation - after implementation

Before we merge, Daniel will make a full corpus revalidation (in their
`reports/` nested (ignored) git repo)

- in apps/epub-validate: `bun run validate;  (cd reports/; git status )`
- in apps/align: `bun run align.ts;  (cd reports/; git status )`

(Refactor contract: both must come back byte-identical — clean `git status` —
since packages/align is pure code motion.)
