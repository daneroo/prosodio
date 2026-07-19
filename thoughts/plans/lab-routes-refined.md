# lab-routes-refined — per-artifact lab surfaces

Status: planned

Goal: grow `/lab` from one surface (Locate) into a list-first inspection surface
per pipeline artifact — Corpora, Audiobooks, Epub, VTT, Alignment, Locate
(Parsers reserved) — rationalizing the partial implementations behind each into
their proper homes as we go.

## Framing

Bookplayer is, for now, a lab for refining every part of the pipeline. Each lab
tab is ONE artifact type, in pipeline order: scan -> assets (m4b / epub / vtt)
-> alignment -> locate. Each surface gets a list/summary view backed by a lean
server fn or `/api` route; a detail view only where inspection actually pays
(Alignment first). The tab boundary is also the intended lib boundary.

## Dispatch policy

Daniel's directive: "For all coding tasks use your judgement to decide an
appropriate lower power model and run that in a subagent." Same mechanics as
`plans/archive/player-sync-core.md`: sequential delegation, one commit per task,
`bun run ci` green before each commit.

- `[tier: low]` -> Haiku (mechanical: renames, extractions with no behavior
  change, list pages from existing rows)
- `[tier: med]` -> Sonnet (scoped feature/refactor with a written spec)
- orchestrator: specs, wiring review, acceptance, commits; may promote a task a
  tier when implementation reveals complexity

## Decisions

- D1 — taxonomy: tabs = pipeline artifact types; list-first, detail-on-need.
- D2 — structured scan findings: `scan.ts` emits typed findings
  (`{ code, relDir, detail, bookId? }`) instead of prose strings, covering both
  kept books AND excluded candidates (multi-m4b, no-cover, duplicate-basename,
  unreadable-dir, basename-mismatch). Findings persist in the book cache (v2) so
  a cache-restored session still shows them. Per-line warnings leave the server
  logs entirely (the one `[scan]` summary line with counts stays) — the Corpora
  tab becomes the canonical diagnostics view.
- D2b — graded match quality, not binary: for each book, classify the m4b<->epub
  and m4b<->vtt basename pairing as `exact | near | mismatch | absent`, where
  `near` means an almost-match (case-only, whitespace, punctuation differences).
  This is the surface for detecting corpus naming anomalies Daniel does not
  always control; `near` rows are the actionable ones. Detection only — no
  soft-matching behavior change to discovery/pairing (that is
  `align-soft-basename-match`, which this view feeds evidence into).
- D3 — alignment metrics are server-derived from CACHED artifacts only (never
  compute-on-list); the metrics computation moves to `packages/align` so
  AlignmentViewer and the server share one implementation. Uncached rows show
  "—" plus a per-row compute affordance (the locate-sweep page pattern).
- D4 — cache visibility: the Alignment tab exposes the artifact cache itself
  (per-book presence, bytes, mtime, schema version) with per-book evict and
  clear-all. Standing requirement: never wonder whether the cache is valid.
- D5 — locate is a validation gate, not a metric: artifact-token and
  all-epub-token modes both exist (`source: "artifact" | "epub"` in the report),
  and 100% is the only acceptable result in EITHER mode. Any failure renders as
  a bug signal (red, surfaced in summary), not a percentage. All-tokens mode
  needs only the epub — it decouples locate from alignment.
- D6 — Parsers stays a reserved tab; no code. epub-validate's CLI remains the
  parser-equivalence surface until a browser view has a real consumer.
- D7 — lib-first rule: a lab surface moves the logic it needs into `packages/`,
  and new lab code never deepens `apps/bookplayer/src/lib/`. This plan forces
  only the align-metrics extraction; further extractions (epub tokenization,
  scan) happen when a surface forces sharing.
- D8 — `/lab` stays dev-gated; the landing page explains every tab; the home
  page header gains a dev-only "lab" link.
- D9 — scale target is ~1000 books (~100 aligned today). Every list view must
  stay usable at 1000 rows: virtualize with `@tanstack/react-virtual` (already
  proven in Transcript.tsx) when plain rendering strains; details that do not
  fit one row go behind a per-row chevron expand (`>` / `v`), not wider rows.
- D10 — simplicity standing order: the app grew organically, Daniel is the only
  user, in dev, no legacy to protect. Simplify at every opportunity; executors
  may exercise design judgment to delete or unify as they touch code. Payload
  discipline for sweep/locate: reports stay totals + capped-failure samples
  (today's files are 4-16K — keep that property); any new bulk transport (the S5
  epub token stream) reuses the proven artifact-http conventions (etag + gzip)
  or fetches per-section — no new caching layers.

## Steps

### S1 — shell, landing, shared components [tier: low]

- [ ] `lab.tsx` tab bar: Corpora, Audiobooks, Epub, VTT, Alignment, Locate (live
      as they land; stubs meanwhile), Parsers reserved. `lab.index.tsx` cards
      updated to explain each surface (D8).
- [ ] Home header: dev-only link to `/lab` (mirror of the lab header's "library"
      link).
- [ ] Extract the shared lab presentation pieces (table shell, summary line,
      status label, formatGeneratedAt) from `lab.locate.index.tsx` into
      `src/components/lab/` and re-point the locate pages. No behavior change.
      The table shell owns the D9 concerns once for all surfaces: virtualized
      rows at corpus scale and the per-row chevron expand slot.

### S2 — Corpora [tier: med]

- [ ] `scan.ts`: replace `warnings: Array<string>` with typed findings (D2);
      `library.ts` cache v2 persists them (version guard bump invalidates old
      caches — that is the intended migration); console demoted to the summary
      line. `fetchLibrary`'s `warningCount` becomes a findings count.
- [ ] Match-quality classification (D2b): epub side compares basenames within
      the book dir; vtt side must LIST the transcriptions dir and compare
      normalized names — today's `hasVtt` is an exact-name `existsSync`, so a
      case-only vtt is currently indistinguishable from a missing one.
- [ ] Server fn `fetchScanReport`: findings + match classes + lean book
      projections including `relDir` (lab-only surface; still no absolute
      paths).
- [ ] `/lab/corpora`: summary line (books, findings by code, scan age/root),
      books table with finding badges plus epub/vtt match-quality columns
      (`exact | near | mismatch | absent`, D2b — `near` visually distinct as the
      actionable class), and an excluded-candidates section — the rows that
      never became books.
- Acceptance: fixtures root shows expected findings; a cache-restored session
  still shows findings; per-line `console.warn` spam gone on start/rescan; a
  case-only epub or vtt name difference classifies as `near`, not `mismatch`.

### S3 — asset lists (Audiobooks, Epub, VTT) [tier: low]

- [ ] `/lab/audiobooks`: all books — duration, size, codec, bitrate (extend the
      row projection with codec/bitrate). Placeholder detail deferred; ffprobe
      chapters noted as the future detail-view payload.
- [ ] `/lab/epub`: books with an epub — size, basename-mismatch badge.
      List-only; validation is out of scope (epub-validate inspiration recorded
      in the landing card).
- [ ] `/lab/vtt`: books with a vtt — cue count + cue-span duration via
      `packages/vtt` (server fn, computed on request).
- Acceptance: all three render from the shared S1 components; no new state.

### S4 — Alignment [tier: med, the detail-view candidate]

- [ ] Move the metrics computation (vttCoverage, epubCoverage, spanCount,
      gapCount) from the viewer path into `packages/align`; AlignmentViewer
      consumes it unchanged (D3/D7).
- [ ] Artifact-cache introspection in the server: list entries
      `{ bookId, bytes, mtime, schemaVersion }`; metrics parsed from cached
      bytes, memoized in-memory keyed by mtime. Evict (per-book) and clear-all
      operations (D4).
- [ ] `/lab/alignment` list: eligible pairs (epub && vtt), metrics columns,
      cache column (bytes/age), per-row compute (fetches `/api/alignment/:id` —
      first compute may take minutes, show the honest status) and evict;
      clear-all with confirm. Summary line aggregates corpus coverage.
- [ ] `/lab/alignment/$bookId` detail: standalone inspector — header metrics,
      spans/gaps table (sortable, filter by gap size), per-cue coverage. No
      audio, no player chrome.
- Acceptance: list loads instantly with nothing cached (all "—"); compute fills
  a row; evict reverts it; clear-all empties the cache dir; the player behaves
  identically after the metrics extraction.

### S5 — Locate all-tokens mode [tier: med]

- [ ] Sweep source abstraction: artifact tokens (today) or all epub tokens
      (tokenize the same extraction the aligner reads, server-side; the sweep
      still runs in the browser against real epub.js). Eligibility for epub mode
      is `hasEpub` alone. Size caution (D10): the token stream for a whole book
      is artifact-scale — transport it via the existing artifact-http path
      (etag + gzip) or per-section fetches; the REPORT keeps today's shape
      (totals + failures capped per section, files stay KB-sized).
- [ ] Report schema v2: per-source sections in `<bookId>.locate-sweep.json`
      (`{ artifact?, epub? }`); v1 files are refused and re-run (a version bump
      is cache invalidation, not a compat promise). Index reports both.
- [ ] Sweep page: mode toggle; summary and rows render any `failed > 0` as a bug
      state (D5), both modes expected 100%.
- Acceptance: fixture book sweeps clean in both modes; a v1 report on disk is
  ignored/replaced without error; failures visually unmissable.

## Relates

- `align-soft-basename-match` — D2b detects the near-miss class that item would
  repair; this plan surfaces evidence, that item changes pairing.
- `corpora-omnibus-mapping` — the Corpora tab is where 1-epub:N-audiobook
  representation will eventually surface; out of scope here.
- `promote-app-config` — adjacent first brick of data-plane extraction;
  unblocked but not blocking.
- `locate-sweep-epubjs-console-noise` — unchanged by S5; still cosmetic.
