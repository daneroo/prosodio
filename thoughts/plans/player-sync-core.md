# player-sync-core — sync model cleanup + /lab routes + matching design doc

Status: planned

One iteration executing three backlog ids (BACKLOG "Now", 2026-07-10):
`player-sync-core` (primary), `lab-routes`, `matching-quality-design`. Tickets:
[player-sync-core](../tickets/player-sync-core.md),
[lab-routes](../tickets/lab-routes.md); matching-quality-design has no ticket
(index entry only).

Goal: one canonical sync state (playhead <-> matched span <-> book location)
owned by the player, panels as optional subscribers, EPUB -> audio reverse sync;
`/dev/*` renamed to `/lab/*` with the surface map reserved; a design doc
reproducing the CURRENT matching algorithm, params, and metrics with affordances
for evolution.

## Dispatch policy

Coding tasks are delegated to lower-power subagent models, sequentially, one
commit per task, CI green before each commit (Daniel's standing instruction):

- `[tier: low]` -> Haiku (mechanical: renames, extractions with no behavior
  change)
- `[tier: med]` -> Sonnet (scoped feature/refactor work with a written spec)
- orchestrator (Fable): specs, wiring review, acceptance, commits

## The problem being fixed (evidence)

`routes/player/$bookId.tsx` today: `useAudioTransport` owns audio state;
`AlignmentViewer` FETCHES the artifact, derives the active token from
`currentTime` (`activeTokenAt`), and reports it up via `onActiveToken`; the
route's follow logic (`showInBook`) hangs off that callback. Consequences:

- reader follow only works while the alignment panel is mounted (`alignOpen`) —
  the recorded v1 limitation; a debug panel is load-bearing.
- position flows one way only: audio -> panel -> reader. No EPUB -> audio.
- the route file (630 lines) mixes chrome (search UI), transport, follow policy,
  and locate plumbing.

## Design decisions

- S1 — Sync core is a route-level hook, not a store library.
  `usePlayerSync(bookId, currentTime)` in new
  `apps/bookplayer/src/lib/player-sync.ts`: owns artifact fetch + prepare
  (lifted OUT of AlignmentViewer), derives `activeTokenSeq` / `activeCueIndex`,
  exposes lookup commands. Plain React hook + props; no new state dependency.
- S2 — AlignmentViewer becomes a pure subscriber: receives `prepared` +
  `activeTokenSeq` as props; loses its fetch and its `activeTokenAt` call; keeps
  row building/virtualization/rendering. Follow works with the panel closed BY
  CONSTRUCTION, since the route derives the active token itself.
- S3 — Reverse resolution is pure package code in `packages/align`
  (browser-safe, unit-tested), three helpers:
  - `segIndexForTextNode(root, segPaths, node)` — walk parentNode chain building
    the childNodes-index path, look it up in a Map keyed by `path.join(",")`.
    Inverse of `resolveNodeAtPath`.
  - `epubSeqAtDomPoint(epubData, spineIndex, segIndex, offset)` — binary search
    the spine's contiguous token range (spineIndex column is non-decreasing) for
    the token whose `[startSeg/startOffset, endSeg/endOffset)` contains the
    point; miss -> nearest-token-or-null result shape that distinguishes "hit"
    from "between tokens".
  - `vttSeqForEpubSeq(spans, epubSeq)` — binary search spans by `epubStart`;
    `vttStart + (epubSeq - epubStart)` (deriveEpubSeq run in reverse, same math
    as the sweep). Null when the token is unmatched (in a gap).
- S4 — Double-click = the reverse-sync gesture. In the epub.js iframe, dblclick
  natively selects the word; a content hook (`rendition.hooks.content`) listens
  for `dblclick`, reads the selection's start node/offset + the section href,
  and calls a new `EpubReader` prop
  `onWordActivate({ sectionHref, node, offset })`. The route maps it: href ->
  spine (existing suffix rule) -> segIndex -> epubSeq -> vttSeq ->
  `audio.seek(tokenStart[vttSeq])`. Play/pause state is preserved — seek only
  moves position.
- S5 — Unmatched word: SNAP, preferring the forward neighbor (Daniel 2026-07-10)
  — the first matched token at-or-after the clicked point in EPUB order,
  avoiding bidirectional distance semantics. Refusal + transient notice only
  when nothing is resolvable (no spine match, path failure, or no matched span
  forward — executor picks snap-backward vs refuse for trailing content and
  records the choice here). EXECUTED (T2.3): trailing content REFUSES (no
  snap-backward); forward snap does not cross into the next spine; refusals
  surface as a transient `reverseSyncNotice` banner (visible with the panel
  closed), distinct from the panel-only locateFailure surface.
- S6 — Routes AND data-plane names rename together — naming consistency wins
  (Daniel 2026-07-10; the cache is disposable, orphaned reports are a
  non-concern). `lab.tsx` layout route renders the tab bar (Locate | Align |
  Epub | Parsers — the last three disabled placeholders) + Outlet;
  `lab.index.tsx` is a lite landing; `dev.sweep.tsx` -> `lab.locate.index.tsx`
  (index file so the `$bookId` detail is a sibling leaf, not forced through an
  Outlet), `dev.locate.$bookId.tsx` -> `lab.locate.$bookId.tsx`. API + store:
  `/api/sweep` -> `/api/locate-sweep` (index and `:bookId`),
  `<bookId>.sweep.json` -> `<bookId>.locate-sweep.json`, `sweep-store.ts`
  renamed to match. Old `.sweep.json` files are ignored from then on (wipe or
  re-run at will). No schema impact: the alignment artifact is untouched and the
  sweep report is an unversioned disposable dev report.
- S7 — In-app isolation only (no packages/ extraction; second-client rule):
  `useAudioTransport` moves to `lib/audio-transport.ts`, the search UI extracts
  to `components/SearchPanel.tsx`. Behavior-preserving.
- S8 — No engine or schema changes anywhere in this plan: no
  `ALIGNMENT_ARTIFACT_SCHEMA_VERSION` bump, no cache regen, no report
  re-baseline. The design doc DESCRIBES; it does not change the matcher.

## Phase 1 — lab routes

### T1.1 Route rename + link sweep `[tier: low]`

Files: `src/routes/dev.sweep.tsx` -> `src/routes/lab.locate.index.tsx`,
`src/routes/dev.locate.$bookId.tsx` -> `src/routes/lab.locate.$bookId.tsx`;
update the `createFileRoute` path literals (`bun run generate-routes` rewrites
them — run it and commit the regenerated routeTree), internal links between the
two pages, the player top-bar dev link (`/dev/locate/${book.id}` ->
`/lab/locate/${book.id}`, label `sweep` -> `lab`), `apps/bookplayer/README.md`,
`docs/LOCATE-SWEEP.md` route mentions. No logic changes; API rename is T1.3, not
here.

### T1.2 Lab layout + landing `[tier: med]`

Files: new `src/routes/lab.tsx`, new `src/routes/lab.index.tsx`; T1.1's two
routes become its children (TanStack nesting is path-based — verify the
`$bookId` detail renders inside the layout).

- `lab.tsx`: dev-gated like the current pages; slim header ("Lab — corpus
  inspection surfaces") + tab bar: Locate (live), Align / Epub / Parsers
  (disabled, `title="reserved"`); Outlet below. Match existing slate styling.
- `lab.index.tsx`: one short card per surface — what it measures, what exists
  today (locate: DOM-path -> epubcfi round-trip over matched tokens; align:
  reserved for match-quality views; epub: reserved for conformance; parsers:
  reserved for equivalence) — linking to live summaries.
- Acceptance: `/lab` renders tabs + landing; `/lab/locate` table + Run all still
  work; the `$bookId` detail renders inside the layout.

### T1.3 locate-sweep data-plane rename `[tier: low]`

Per S6: `src/lib/sweep-store.ts` -> `src/lib/locate-sweep-store.ts` (+ its
test), persisted filename suffix `.sweep.json` -> `.locate-sweep.json`,
`/api/sweep` + `/api/sweep/:bookId` -> `/api/locate-sweep` +
`/api/locate-sweep/:bookId`, and every client fetch/mention in the two lab
pages, `apps/bookplayer/README.md`, `docs/LOCATE-SWEEP.md`. Grep for `sweep`
across the app afterward: remaining hits should only be the sweep ALGORITHM
(`locate-sweep.ts`, `sweepBook`, report types), which keeps its name — the
operation is a sweep; the surface is locate.

## Phase 2 — player sync core

### T2.1 Reverse-locator helpers in packages/align `[tier: med]`

Files: new `packages/align/src/epub-dom-point.ts` + test; export via the
package's browser entry (mirror how `epub-dom-path.ts` is exported).

- The three S3 helpers, pure DOM + columnar-artifact math only.
- Tests: jsdom fake docs for `segIndexForTextNode` (including a node NOT in the
  table -> null); columnar fixtures for `epubSeqAtDomPoint` boundaries
  (first/last token of a spine, offset between tokens, multi-seg token) and
  `vttSeqForEpubSeq` (span interior, span edges, gap -> null).

### T2.2 usePlayerSync + AlignmentViewer as subscriber `[tier: med]`

Files: new `src/lib/player-sync.ts`; `src/components/AlignmentViewer.tsx`;
`src/routes/player/$bookId.tsx`.

- Hook state:
  `{ status: loading|unavailable|error|ready, prepared, activeTokenSeq, activeCueIndex, activeToken: ActiveTokenInfo | null }`;
  fetch/prepare moved from AlignmentViewer (abort on unmount, same
  `fetchArtifact` contract).
- Route: follow effect consumes `activeToken` from the hook (replacing the
  `onActiveToken` callback path); `alignOpen` no longer gates it.
  AlignmentViewer props become
  `{ prepared, activeTokenSeq, activeCueIndex, onSeek, onShowInBook, locateFailure }`
  (+ its unavailable/error rendering moves up or stays prop-driven — subagent's
  call, but the panel must still render those states when open).
- `ActiveTokenInfo` moves to `player-sync.ts` (or lib/types) so the viewer
  imports it, not vice versa.
- Regression guard: with the panel CLOSED, follow still drives the reader (this
  is the acceptance headline).

### T2.3 Double-click reverse sync `[tier: med]`

Files: `src/components/EpubReader.tsx` (new optional `onWordActivate` prop,
content-hook dblclick listener per S4 — mind iframe document listeners are
per-section, register in the same place existing content wiring lives);
`src/routes/player/$bookId.tsx` (map to seek via T2.1 helpers + S5 refusal
feedback); `src/lib/player-sync.ts` (expose `timeForBookPoint(...)` composing
the helpers, so the route stays thin).

- Snap policy per S5: unmatched click seeks to the forward-neighbor matched
  token; brief non-blocking notice only for the unresolvable cases (style of the
  existing locate-failure notice).
- Manual dblclick disengages follow? NO — a deliberate seek re-syncs playback to
  that point; follow stays as-is and will re-locate from the new position.

### T2.4 Reader chrome colocation + search panel `[tier: med]`

Daniel 2026-07-10: the EPUB controls (Chapters select, prev/next pagers, search
toggle) currently live in the GLOBAL top bar; colocate them with the EPUB view
instead — a slim toolbar at the top of the reader pane. Files: new
`src/components/ReaderToolbar.tsx` (Chapters/prev/next/search toggle, driven by
the existing `ReaderController` + `toc` props), new
`src/components/SearchPanel.tsx` (the two search overlay blocks + submit/close
handlers, anchored to the reader pane rather than the page),
`src/routes/player/$bookId.tsx` (top bar keeps identity + follow/align/lab
toggles only). Visual: same slate styling; the alignment split must not reflow
oddly with the toolbar present (toolbar belongs to the reader pane side only).

### T2.5 Audio transport extraction (behavior-preserving) `[tier: low]`

Files: `src/lib/audio-transport.ts` — move `useAudioTransport` + `audioPosKey`

- keyboard handling out of the route verbatim; route imports it. No behavior
  change; CI + manual smoke.

### P2.6 Acceptance (orchestrator + Daniel)

- Alice + one private book, in-app browser: play -> follow with alignment panel
  CLOSED tracks in the reader; double-click a matched word -> audio seeks
  (verify near a chapter boundary); double-click front-matter (unmatched) ->
  snaps forward or notices per S5; reader controls render with the reader pane
  and work; search/TOC/prev/next still disengage follow as today.

RESULT (orchestrator half, 2026-07-11, in-app browser on Alice): acceptance
surfaced THREE cold-start defects in EpubReader — all the same class, epub.js
`display()` promises that can wedge forever — fixed as T2.6 below. Verified
after the fixes: follow effect + dedup + locate all resolve `ok` per token with
the panel CLOSED; dblclick reverse-sync seeks correctly (matched word -> exact
time; all views converge); panel token-level follow, transcript, and transport
stay live under any wedge. RESIDUAL (env-uncertain): in the orchestrator's
embedded browser, a `rendition.display()` to a NEW section can still wedge
inside epub.js when it lands near a container resize (panel toggle) or a
saved-position locate storm at mount; once wedged, that rendition never paints
again (even `next()` — manager dead), though the app degrades gracefully (5s
`[latest-wins]` warns, everything else functional). NOT yet reproduced in a
normal browser — Daniel's half of P2.6 decides whether this is real-user-facing
(then: new ticket, candidate approaches — rendition re-create on repeated
timeout, or `bookplayer-ebook-renderer` acceleration) or an embedded-browser
artifact. One-shot `[reader]` mount breadcrumbs are left in EpubReader to make
that check easy.

### T2.6 EpubReader display-wedge hardening (added during P2.6) `[tier: med]`

Root-caused live with console breadcrumbs; three layered fixes, all CI-covered:

1. `src/lib/latest-wins.ts` (+6 tests): latest-wins async scheduler — one run in
   flight, queue depth 1 with supersession, 5s timeout self-heal. ALL
   follow/resize-driven `rendition.display()` calls flow through it; a locate
   whose display is superseded still resolves ok (newer locate owns the screen).
   Fast path: a target cfi already within `rendition.currentLocation()` (EpubCFI
   compare) skips display entirely — word-to-word follow on the same page costs
   no repagination.
2. Init reorder: `onToc`/ResizeObserver/`onController` deliver immediately after
   `book.ready`; the initial position display runs non-blocking through the
   scheduler (cover-advance chained, skipped when superseded, hardened against
   unrendered self-heals). A wedged display can no longer block controller
   delivery — the pre-fix symptom was a permanently null controller and a
   silently dead follow.
3. Detached section loads in `locate`: `book.load(section.url)` + own-document
   parse instead of `section.load(...)` on the SHARED Section object epub.js's
   renderer also mutates (`section.cfiFromRange` is pure — safe on a detached
   range). Removes locate<->display Section contention.

## Phase 3 — matching-quality design doc

### T3.1 Draft `thoughts/design/matching-quality-design.md` `[tier: med]`

Reproduce the system AS BUILT (read `packages/align/src`: `align-book.ts`,
`vtt-sequence.ts`, `normalize.ts`, `epub-extract.ts`, `exact-pass.ts`, `lis.ts`,
`reconcile.ts`, `metrics.ts`, `config.ts`; and how `apps/align` reports + the
artifact's `match.spans`/`match.gaps` consume it). Required sections:

- Pipeline: sequences -> Pass 1 (exact unique n-gram: candidates unique in both
  streams, LIS monotonic selection, diagonal coalescing, bounded exact
  extension) -> reconciliation -> gaps -> metrics. Actual param values from
  `config.ts` (ngram size, windows, thresholds), named as the CURRENT baseline.
- Metrics vector as computed today (`metrics.ts`: coverage, pass stats,
  distributions, anomaly thresholds); where each surfaces (CLI report, artifact,
  viewer).
- Evolution affordances (design, not commitment): pass registry semantics
  (`passes[]`/`passId` already exist — new passes are ADDITIVE inside residual
  gaps via the same reconciliation gate); metrics live in reports/views, never
  fatten the artifact payload; experiments = param set + re-baselined reports
  diff.
- Future directions (unscoped, from Daniel 2026-07-10): gap heuristics (skipped
  words), content qualification — front/back matter, footnotes read-or-skipped,
  audio-only segments breaking linearity.
- First candidate increment, recorded: HISTOGRAM OF GAP LENGTHS — view-only,
  derived client-side from `match.gaps`/spans (natural home: the reserved
  `/lab/align` summary), explicitly NOT added to the artifact payload.

### P3.2 Review gate (Daniel)

Design doc read + annotated before any matching work is planned from it.

## Order & closing

T1.1 -> T1.2 -> T1.3 -> T2.1 -> T2.2 -> T2.3 -> T2.4 -> T2.5 -> P2.6; T3.1
anytime after Phase 1 (doc-only, no code deps); P3.2 gates nothing in this plan.
Branch: `player-sync-core`. Closing: move the three ids to BACKLOG Closed,
delete tickets `player-sync-core` + `lab-routes`, archive this plan;
LOCATE-SWEEP.md route references already updated by T1.1/T1.3.

- [x] T1.1 route rename + link sweep
- [x] T1.2 lab layout + landing
- [x] T1.3 locate-sweep data-plane rename
- [x] T2.1 reverse-locator helpers + tests
- [x] T2.2 usePlayerSync + subscriber AlignmentViewer
- [x] T2.3 double-click reverse sync
- [x] T2.4 reader chrome colocation + search panel
- [x] T2.5 audio transport extraction
- [ ] P2.6 acceptance (orchestrator + Daniel)
- [x] T3.1 matching-quality design doc
- [ ] P3.2 design review gate (Daniel)
