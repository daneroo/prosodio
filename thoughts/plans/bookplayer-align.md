# bookplayer-align — The Prosodio Bookplayer - Alignment Visualisation

Status: approved — executing on branch `bookplayer-align`

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
- [ ] Phase 4 — EPUB positioning join (D5): `fetchEpubAnchor` + reader
      `locate` + affordance; fallback `goTo(href)` acceptable. Browser-verified
      on Alice matched cues.
- [ ] Phase 5 — acceptance + docs: fixtures acceptance recorded (Alice is the
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

## My Validation - after implementation

Before we merge, Daniel will make a full corpus revalidation (in their
`reports/` nested (ignored) git repo)

- in apps/epub-validate: `bun run validate;  (cd reports/; git status )`
- in apps/align: `bun run align.ts;  (cd reports/; git status )`

(Refactor contract: both must come back byte-identical — clean `git status` —
since packages/align is pure code motion.)
