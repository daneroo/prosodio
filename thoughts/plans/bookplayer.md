# bookplayer — build the Prosodio Bookplayer app

Status: active

Goal: ship `apps/bookplayer`, a local-first TanStack Start web app that lists
canonical audiobook records and plays each book with a reader-first EPUB
surface, synchronized VTT transcript strip, and compact audio transport.

Progress (details + evidence live in each phase's checklist and log below):

- [x] Phase 1 — scaffold, workspace integration, framework proof
- [x] Phase 2 — configuration, roots, fixture cover
- [x] Phase 3 — scanner and index
- [x] Phase 4 — server functions and media endpoints
- [x] Phase 5 — EPUB reader spike
- [x] Phase 6 — landing page
- [ ] Phase 7 — player page assembly (ACTIVE)
- [ ] Phase 8 — hardening, acceptance, handoff

## Context and evidence

Three experiments in `ai-garden/experiments/` built this app from
`experiments/seeds/bookplayer.md`. They are evidence, not templates; the seed's
behavioral contract plus current Prosodio conventions govern this plan.

- `bookplayer-agy-opus46` (winner): proves the whole seed shape works —
  canonical scanner (`.m4b` + cover, optional `.epub`), 12-hex sha1 `bookId`,
  four raw-`Response` asset routes with Range/206, `createServerFn` listing,
  epub.js reader with TOC/search/highlight, transcript strip with binary-search
  active-cue tracking, localStorage persistence, ffprobe enrichment. 882 real
  books scanned in ~50 ms. Gaps to fix, not inherit: zero tests, filter defaults
  off (seed says on), fingerprints persisted but never used for invalidation,
  cache as app-root `.book-cache.json`, `startsWith` traversal check without
  separator (prefix-collision bug) and no symlink handling, TanStack devtools
  chrome visible in the product.
- `bookplayer-claude-opus-46` (honorable mention): simplest working player and
  cleanest read. Rejected wholesale as a base: it exposes filesystem-relative
  paths in asset URLs, rescans the library inside every player load, and skips
  most of the contract (no VTT-missing state, loose scanner, no filters).
- `bookplayer-codex-gpt-5.3-codex` (terminated): keep its CI/test discipline —
  temp-dir scanner tests, suffix-range parsing, structured `RouteDataError`
  payloads, buffered non-range EPUB bytes (its `ERR_CONTENT_LENGTH_MISMATCH`
  fix), and the load-lifecycle lesson (key epub.js lifecycle to `epubUrl`, never
  to relocation state). Reject its strict `.m4b`+`.epub` pair model,
  `/player/$pairId` route, and oversized public type surface
  (`LibraryPair`/`PublicLibraryPair`/`PairAssetUrls`).

Visual review (private-corpus screenshots under `ai-garden/plans/`, not to be
copied into this repo):

- Preserve: Claude's bounded reading surface with actionable search (12 `Dizzy`
  results, click navigates and visibly highlights); AGY's vertically compact
  chrome giving the reader roughly two-thirds of the desktop viewport; both
  prove a persistent capped transcript strip plus transport fits.
- Avoid: AGY's mobile search toolbar that cannot show input, submit, and close
  at 390 px; AGY's results overlay consuming most of the reader; AGY hiding ±1m
  and volume on mobile; Claude's mobile transport clipped off the right edge;
  devtools/starter chrome on player surfaces.
- Reconsider: both open on a full-page EPUB cover (functional rendering, but the
  compact-cover acceptance check must be explicit); Claude's desktop-to-mobile
  reflow lost the searched match and its highlight — responsive location
  preservation needs a dedicated acceptance check.

Current Prosodio changes the approach: Bun workspace with root-owned quality
gates (`bun run ci` = fmt:check, lint, tsc, `bun test`), `@prosodio/vtt` as the
only VTT parser, align-style `lib/config.ts` root sets (fixtures + private),
`data/<app>/…` for volatile state, and the PRIVACY rule that anything derived
from private corpora stays uncommitted.

## UX thesis

One screen, three bands, reading first. The player page is a book you happen to
be able to hear: a single-row top bar (back, title/author, TOC, reader nav,
search toggle), a dominant contained reading surface, and a bottom dock holding
a capped transcript strip above a transport row. Both experiments spent two
chrome rows above the reader (app header plus EPUB toolbar); merging them into
one row is this design's main deliberate departure and buys the reader height
the budgets demand. Search is the second departure: a bounded panel anchored
under the top bar (right-aligned desktop, full-width sheet on mobile) that
collapses to a compact "n of N, prev/next" pager once a result is chosen, so
results survive navigation without an overlay eating the reader. Third: mobile
keeps the full transport contract (±15s, ±1m, speed, volume) by allowing the
dock two rows on narrow widths instead of hiding controls, still inside the
chrome budget. Listening without an EPUB stays first-class: the reader band
shows an explicit no-ebook state and everything else works.

## Scope and non-goals

In scope (v1): the two routes, canonical scanning/indexing with cache and
rescan, four asset endpoints, full transport with keyboard, speed, volume, and
resume, epub.js reader with TOC, persisted CFI, and full-text search with
highlight, transcript strip with active-cue tracking and cue-seek, filterable
searchable sortable paginated landing page, fixture-based tests, MCP browser
acceptance.

Non-goals (v1):

- Word/sentence-level audio-to-EPUB alignment. Seam kept: stable `bookId`,
  transcript cues in seconds, transcript module isolated behind one server
  function — alignment artifacts can later attach by `bookId` without reshaping
  the player.
- Multi-file audio and seamless next-track progression. The seed's directory
  invariant is a single `.m4b`; directories with several `.m4b` files are
  excluded with a warning (matches align's `duplicate-m4b` exclusion). The
  seed's conditional next-track clause is vacuous under that invariant; revisit
  only if the corpus changes.
- Auth, multi-user, remote deployment, editing metadata, non-EPUB ebooks.
- Fuzzy/case-insensitive VTT matching (tracked repo-wide as
  `align-soft-basename-match`).

## Architecture

Ownership: `apps/bookplayer` is a workspace member (`@prosodio/bookplayer`),
private, never published. It owns its scanner/index/media logic. It must not
import from `apps/align` — align's triplet discovery requires all three assets
and would wrongly drop EPUB-less books; the Bookplayer scanner is a different
contract (canonical = `.m4b` + cover). No new shared package now: the only
cross-app concern that already has two-plus consumers is app config, and that
lift is tracked as `promote-app-config`; bookplayer becomes its fourth consumer
later. `@prosodio/vtt` (workspace dep) is the single VTT parsing contract,
consumed server-side only.

Runtime/data flow:

- Route loaders call server functions; server functions read the in-memory
  index; asset bytes flow through raw-`Response` server routes. No absolute or
  relative filesystem path ever reaches the client — only `bookId` and derived
  asset URLs.
- Index lifecycle (reconciliation style): on first access, restore
  `data/bookplayer/cache/index.json` if present and serve immediately, then
  revalidate in background; otherwise scan synchronously. A scan walks the
  configured roots (fast — directory entries only), rebuilds the book set, and
  reuses cached ffprobe metadata for entries whose fingerprint (relative path,
  mtime, size) is unchanged; changed/new entries are re-probed in the background
  with bounded concurrency (`p-limit`, default 4, documented) and the cache
  re-persisted. One scan at a time (module-level lock); overlapping rescan
  requests return an in-progress status.

Routes and server surface:

- `/` — library directory. Loader: `fetchLibrary`.
- `/player/$bookId` — player. Loader: `fetchBook`.
- Server functions (`src/server/library.ts`): `fetchLibrary` (lean rows: id,
  title, author, durationSec, sizeBytes, hasEpub, hasVtt, scan stats + warning
  count), `fetchBook` (same row shape for one id), `fetchTranscript` (parses the
  matched VTT with `@prosodio/vtt`, returns lean `{ startSec, endSec, text }`
  cues via `vttTimeToSeconds` — zod and parsing stay server-side),
  `triggerRescan`.
- Asset routes — REVISED in Phase 6 (architectural change): the four endpoints
  are nitro-native handlers (`server/handlers/*.ts`, registered via
  `nitro.handlers` in vite.config.ts), thin shims over `server/assets.ts` +
  `lib/media.ts` — `/api/audio/$bookId` (Range/206), `/api/cover/$bookId`,
  `/api/epub/$bookId` (buffered full-body bytes with exact Content-Length),
  `/api/vtt/$bookId`. Why not TanStack server routes as originally planned:
  nitro's dev middleware content-negotiates on `Sec-Fetch-Dest` and only
  dispatches asset-destination requests (`image`, `audio` — exactly what
  `<img>`/`<audio>` send) to routes in nitro's own routing table; TanStack
  internal routes 404 in dev for those requests. Verified identical behavior in
  dev and production (200/206 under image/audio fetch-dests). All validate
  `^[a-f0-9]{12}$`, resolve through the index, emit `Server-Timing`.

Asset security (`lib/media.ts`): central `safeResolve(root, relPath)` that
resolves, `realpath`s both file and root, and requires
`real.startsWith(realRoot + sep)` — closing AGY's missing-separator prefix bug
and symlink escapes. Structured JSON errors for invalid id (400), unknown id
(404), missing file (404), bad range (416).

Identity: `bookId = sha1(basename.toLowerCase().trim()).slice(0, 12)` of the
`.m4b` basename; basename kept in the record for diagnostics and VTT matching.
Duplicate normalized basenames across the library collide by design (same
canonical key): the first record in sorted relative-path order wins; later ones
are excluded with a warning counted in scan stats. `.m4b` vs `.epub` basename
mismatch inside a folder: still grouped by folder, warning logged.

State and cache: server state is the in-memory index plus
`data/bookplayer/cache/index.json` (versioned schema; invalid/old versions are
discarded, not migrated). Client state is localStorage: `bookplayer:<id>:audio`
(position seconds), `bookplayer:<id>:cfi`, `bookplayer:filters`.
Browser-evidence artifacts go to `data/bookplayer/evidence/` (gitignored).

File layout (app-local components stay here; promote to repo `components/` only
when a second app consumes them):

```txt
apps/bookplayer/
  package.json            # @prosodio/bookplayer; workspace:* on @prosodio/vtt
  vite.config.ts          # tanstackStart() + nitro({ preset: "bun" }) + tailwind
  tsconfig.json           # scaffold-derived; app-owned (DOM libs, @/* alias)
  eslint.config.mjs       # scaffold/TanStack flat config (nested lookup)
  .env.example            # documented keys, no machine-specific absolute path
  src/
    lib/config.ts         # root sets, env resolution, data dirs (align-style)
    lib/types.ts          # BookRecord, BookMetadata, Fingerprint, LibraryIndex
    lib/scan.ts           # pure walk + group; testable on synthetic dirs
    lib/library.ts        # index lifecycle: cache, lock, rescan, enrichment
    lib/ffprobe.ts        # probe with timeout; p-limit concurrency
    lib/media.ts          # safeResolve, mime, range parse, Response builders
    server/library.ts     # createServerFn wrappers
    routes/__root.tsx, index.tsx, player/$bookId.tsx
    routes/api/{audio,cover,epub,vtt}/$bookId.ts
    components/EpubReader.tsx, Transcript.tsx, PlayerDock.tsx
    lib/*.test.ts         # bun:test units (see Testing)
```

Workspace integration (root conventions, no nested repo, no duplicated tooling):

- Scaffold with the current CLI (validated 2026-07-03: `--deployment nitro`,
  `--toolchain eslint`, `--no-examples`, `--no-git`, `--no-install`,
  `--target-dir` all exist):
  `bunx --bun @tanstack/cli create bookplayer --target-dir apps/bookplayer --framework React --package-manager bun --deployment nitro --toolchain eslint --no-examples --no-git --no-install`,
  then a single root `bun install` (root lockfile owns resolution). Re-check
  `--help` before running; CLI output overrides docs and these notes.
- Prune scaffold duplication: remove prettier config/dep (root owns), remove
  devtools packages (`@tanstack/react-devtools`, `@tanstack/devtools-vite`) — no
  dev chrome on player surfaces, remove testing-library/vitest/jsdom stack
  (tests use `bun:test`), remove starter assets/routes.
- App scripts: `dev` (`bun --bun vite dev --port 3000`), `build`, `preview`,
  `start` (`bun run .output/server/index.mjs`). Quality scripts stay root-level;
  no app-local `ci`.
- Root `check` cannot type an app needing DOM libs and vite types under the root
  tsconfig, so bookplayer is the special case: root `tsconfig.json` excludes it,
  the app owns `"check": "tsc --noEmit"` against its own tsconfig, and the root
  script discovers member checks generically —
  `"check": "tsc --noEmit && bun run --filter '@prosodio/*' check"`. The filter
  skips members without a `check` script and propagates failures (both
  verified), so future divergent apps add their own script without touching the
  root command. (Daniel's review rejected the earlier hardcoded
  `tsc -p apps/bookplayer` chain as unscalable.)
- Root `bun test` picks up `apps/bookplayer/**/*.test.ts` automatically.
- Lint: root runs ESLint 10, which resolves the config nearest to each linted
  file, so the app's `eslint.config.mjs` (React hooks rules) applies from a root
  run. Verify this during Phase 1 (lint an app file with a deliberate hooks
  violation); if lookup does not behave, fold the app config into the root
  config with a `files: ["apps/bookplayer/**"]` block instead.
- Root `.prettierignore` additions: `apps/bookplayer/src/routeTree.gen.ts`,
  `apps/bookplayer/.output/`, `apps/bookplayer/.nitro/`,
  `apps/bookplayer/.tanstack/`. `routeTree.gen.ts` is committed (deterministic
  CI typecheck) but excluded from fmt/lint.
- Dependencies via `bun add` from `apps/bookplayer` (member deps: `epubjs`,
  `p-limit`); `@prosodio/vtt` added by hand as `workspace:*` then root
  `bun install` (per docs/DEPENDENCY.md). No catalog entries — no runtime dep is
  shared by two members yet. `playwright` in `apps/epub-validate` is that app's
  corpus tool, not browser-test precedent; Bookplayer adds no Playwright.

Framework facts validated for this plan (re-verify against installed packages
during Phase 1; installed types/CLI override docs and these notes):

- TanStack CLI current flags as above; Tailwind is always on; recent scaffolds
  generate `src/router.tsx` (the old missing-router gap is fixed).
- Server routes: `createFileRoute` with `server.handlers.{GET,...}` returning
  raw `Response`, `params` for dynamic segments — current docs confirm.
- Server function input validation: RESOLVED in Phase 1 — installed
  `@tanstack/react-start` 1.168.27 deprecates `.inputValidator(...)`; use
  `.validator(...)` (dev-server deprecation warning, 2026-07-03).
- Nitro: RESOLVED in Phase 1 — the scaffold's `nitro: npm:nitro-nightly` alias
  breaks under Bun's isolated workspace linker (the package self-references
  `nitro/meta`); use the stable-name `nitro` beta instead. The plugin arg type
  only admits its own two fields; preset and rollupConfig go through the vite
  `UserConfig.nitro` augmentation (`nitro: { preset: "bun", ... }` — build log
  confirms `preset: bun`).
- `epubjs` (0.3.x) remains the rendering library (seed requirement); parsing
  library `@likecoin/epub-ts` used elsewhere in the repo is not a renderer and
  is not a substitute.

## Product and UX design

Landing page `/`:

- Sticky single-row header: app name, book count + last scan ms, rescan button
  (disabled with spinner while a scan is in progress).
- Controls row: search input (title/author, debounced), sort select (title
  default, author, duration), `EPUB` and `VTT` checkbox filters — both default
  ON per seed truth table: both on = EPUB∧VTT; only EPUB = EPUB; only VTT = VTT;
  both off = all canonical books. Any search/filter/sort change resets to
  page 0. Filters persist to localStorage.
- Grid of cards: cover thumbnail (`loading="lazy"` via `/api/cover/$bookId`),
  title, author, duration (`HH:MM:SS`, `tabular-nums`), asset badges (M4B, EPUB,
  VTT), last progress from localStorage ("Not started" when absent). Whole card
  links to `/player/$bookId`. Pagination (24/page) keeps the page responsive at
  800+ books; virtualization only if the private-corpus check fails.
- States: loading skeleton, scan-error banner with retry, empty state naming the
  active root with configuration guidance (which root is selected and how to
  switch via `BOOKPLAYER_ROOT`).

Player page `/player/$bookId` (dark slate shell per docs/STYLING.md,
high-contrast reading surface, `h-screen` flex column, every band `shrink-0`
except the reader's `flex-1 overflow-hidden`):

- Top bar (one row): back link, truncated title — author, then reader controls
  inline: TOC dropdown, prev/next page, search toggle. No second toolbar row.
- Reader band: bounded clipped container (`overflow-hidden`, explicit
  containment) hosting the epub.js iframe; no bleed into dock or top bar at any
  viewport. No-EPUB state: centered icon + "No EPUB for this title"; unreadable
  EPUB: actionable error message, page stays usable.
- Search panel: anchored under the top bar, `max-h` bounded, scrollable result
  list with match count, capped at 100 results, empty-query and no-results
  states. Desktop: right-aligned panel ≤ 24 rem wide. Mobile: full-width sheet
  over the upper reader half with input, submit, and close visible together at
  390 px. Selecting a result collapses the panel to a persistent mini-pager
  ("3/12", prev/next, reopen, clear) so results stay actionable after
  navigation.
- Transcript strip: always rendered, capped height (~7 rem) with independent
  scroll; cues as buttons (click = seek), active cue highlighted via binary
  search on `currentTime`, auto-scroll keeps active cue visible
  (`block: "nearest"` — no page jumps); loading / error / explicit "No
  transcript available" states.
- Transport row: compact cover thumbnail (the only cover on this page) +
  title/badges, seek slider with current/total time,
  `-1m -15s play/pause +15s +1m` with explicit labels, speed cycle (0.75–2.0×),
  volume slider. Desktop: one row. Mobile (< sm): two rows (seek full-width
  above buttons), all controls present — nothing hidden, nothing clipped.
- Keyboard: Space play/pause; ←/→ ±15 s; Shift+←/→ ±1 m; ignored while typing in
  inputs; all controls focusable with visible focus rings and aria-labels.
- Progress: audio position saved debounced (2 s) + on pause/unmount, restored on
  load when < duration; CFI saved on `relocated`, restored on open.
- Layout budgets (acceptance-measured, not pixel locks): reader ≥ 60 vh desktop
  (hard fail < 50 vh), ≥ 45 vh mobile (hard fail < 38 vh); combined non-reader
  chrome 25–35 vh on both.

EPUB reader behavior (epub.js, client-only dynamic import):

- Open by asset URL with `openAs: "epub"` (proven in AGY); if the installed
  epub.js misbehaves with route-served URLs, fall back to fetch → `arrayBuffer`
  open (codex's fix). Load lifecycle keyed to `epubUrl` only —
  relocation/progress must never re-trigger load (codex regression).
- Paginated flow, single column on narrow widths, spread at `lg` (~1024 px
  Tailwind breakpoint; custom ~840 px only if spread demonstrably fails at
  `lg`). `ResizeObserver` → `rendition.resize()`.
- First open with no saved CFI: display the first linear spine item whose href
  doesn't match `/cover/i`, so readable text — not a full-page cover — is the
  default surface; fallback to default display on any error.
- TOC from `book.loaded.navigation`; prev/next via rendition.
- Search: iterate spine, `section.load(book.load.bind(book))` →
  `section.find(query)` → `unload()`, promise-aware, per-section try/catch,
  dedupe, cap 100. Result click: normalize range CFIs to start-point CFIs,
  `rendition.display(cfi)`, remove previous highlight, apply
  `annotations.highlight` on the full range CFI. Results state survives
  relocation; only explicit clear/new-query resets it.
- Reflow location preservation: track the active target CFI (last search
  selection or last relocation); after a resize/spread change settles,
  re-display it if the visible range no longer contains it — covers the
  desktop→mobile lost-highlight case from visual review.

Failure isolation: audio error (missing/corrupt m4b) shows a transport error
state while reader and transcript keep working, and vice versa; user-facing
messages are actionable and path-free; technical detail goes to server/console
logs only.

## Configuration, fixtures, privacy, observability

Configuration (`src/lib/config.ts`, align-style, the future `promote-app-config`
fourth consumer):

- Two root sets, each `{ name, corporaDir, transcriptionsDir }`, mirroring
  `apps/align/lib/config.ts` (structure conserved per Daniel's direction):
  - `fixtures`: `<repo>/fixtures/audiobooks` + `<repo>/fixtures/transcriptions`
    — committed, always available, powers deterministic acceptance.
  - `private`: corporaDir `/Volumes/Space/Reading/audiobooks` overridable via
    `AUDIOBOOKS_ROOT` (seed-compatible name); transcriptionsDir
    `<repo>/data/transcribe/output` (where `@prosodio/transcribe` writes)
    overridable via `VTT_DIR`.
- Exactly one root is active per server run (Daniel's direction — no merged
  index): `BOOKPLAYER_ROOT=fixtures|private` selects it, default `fixtures` so
  the app runs deterministically with zero configuration. Each record keeps its
  root name (server-side only) for diagnostics.
- Startup validation applies to the selected root: a corpora or transcriptions
  dir that is missing, not a directory, or unreadable fails fast with a clear
  error naming the root and, when an env override is set, the variable (seed
  contract). Selecting `private` with the volume unmounted is therefore a clean
  startup failure, not a silent empty library.
- The private root is legitimate for dev-time testing and experimentation (e.g.
  replicating the `Use Of Weapons` → `Dizzy` search workflow), but CI
  tests/integration/e2e must never depend on it — they use synthetic temp dirs
  and the fixtures root only.
- `PROSODIO_CORPORA_DIR` (provisional, repo `.env.example`) is not consumed in
  v1 — it points at a corpora tree whose audiobook substructure is undecided.
  Migration policy: when `promote-app-config` lands `packages/config` with
  `CORPORA_DIR`/`DATA_DIR`, bookplayer's `config.ts` folds in and the env names
  migrate there with a deprecation note; nothing in v1 may hardcode a
  machine-specific absolute path.
- App-local `.env.example` documents `BOOKPLAYER_ROOT`, `AUDIOBOOKS_ROOT`, and
  `VTT_DIR` with commented placeholder values only (the committed example must
  not carry a machine-specific absolute path; the `/Volumes/...` default lives
  in `config.ts` beside align's, replaced together when `promote-app-config`
  lands); `.env` is gitignored by the root pattern.

Fixtures:

- Gap found: the committed Alice fixture dir has `.epub` (+ fetched `.m4b`,
  gitignored) and a sibling VTT, but no cover — it fails the canonical-record
  invariant, so the fixtures root would list zero books. Smallest legal fix:
  extract the embedded LibriVox cover art (public domain) from the fetched
  `.m4b` (`ffmpeg -i <m4b> -map 0:v -frames:v 1 cover.jpg`), commit
  `fixtures/audiobooks/Lewis Carroll - Alices Adventures in Wonderland/cover.jpg`,
  and record the derivation in a `fixtures/manifest.jsonc` comment. Do not
  weaken the production invariant to accommodate the fixture.
- Unit tests never require fetched fixtures: scanner/media tests build synthetic
  temp-dir libraries (zero-byte `.m4b` files are fine — ffprobe is not exercised
  in units). Browser acceptance requires
  `bun scripts/fetch-and-check-fixtures.ts` first (98 MB m4b).

Privacy (docs/PRIVACY.md applies):

- Public acceptance flow runs on the Alice fixture; the private flow
  (`Use Of Weapons`, EPUB query `Dizzy`) runs with `BOOKPLAYER_ROOT=private`
  when the corpus is mounted, and is encouraged during development as a
  richer-than-fixtures proving ground. Private-corpus screenshots, scan reports,
  cache files, and any derived artifact stay under gitignored
  `data/bookplayer/…`; handoff reports their paths, never their contents, and
  commits none of them.
- Client payloads carry no filesystem paths; server logs may name paths but
  user-facing errors must not.

Observability: `[scan]` (roots, book count, warning count, ms), `[probe]`
(probed/reused counts, concurrency, ms), `[media]` per-asset timing via
`Server-Timing` headers on all four asset routes and the rescan function.
`fetchLibrary` returns scan stats so the landing header can show them.

## Testing and browser acceptance strategy

Automated (bun:test, `src/lib/*.test.ts`, run by root `bun test`; no vitest, no
jsdom — one runner across the monorepo):

- `scan.test.ts`: canonical with `cover.jpg`; `cover.png` fallback; jpg
  preferred over png; optional `.epub`/`.vtt` capability flags; orphan EPUB/VTT
  excluded; basename-mismatch warning; hidden files/dirs skipped; unreadable dir
  warns and continues; multiple `.m4b` excluded with warning; duplicate
  basenames across dirs → first-by-sorted-path wins + warning; nested leaf
  discovery; stable id format/derivation.
- `library.test.ts`: cache persist/restore round-trip; version mismatch
  discards; fingerprint unchanged → metadata reused (no re-probe); fingerprint
  changed → re-probe queued; scan lock coalesces concurrent rescans.
- `media.test.ts` (lib-level `Response` builders on temp files — real HTTP
  semantics land in browser/curl checks): full 200 with exact Content-Length;
  `bytes=0-1023` → 206 + correct Content-Range/Length; suffix range
  `bytes=-500`; open-ended `bytes=1024-`; malformed/unsatisfiable → 416 with
  `Content-Range: bytes */size`; traversal `..`, separator-prefix collision
  (`/root-evil` vs `/root`), and symlink escape all refused; invalid id → 400
  structured; unknown id → 404 structured.
- `config.test.ts`: default root is `fixtures`; `BOOKPLAYER_ROOT` selects the
  active root; invalid selection value rejected; env overrides applied to the
  private root; selected-root dir missing/invalid → fail-fast error naming root
  and variable; fixtures root always resolves.
- `transcript.test.ts`: `@prosodio/vtt` output mapped to lean second-based cues;
  missing VTT → explicit absent result.

Browser acceptance uses the MCP browser tooling available in the session (Claude
Preview / claude-in-chrome / Playwright MCP — whichever is connected). Hard
rules: no `playwright`/`@playwright/test` added to this app as a substitute; if
no browser tooling is available, UI phases are BLOCKED and reported as such — no
completion claims without evidence. Evidence (screenshots + pass/fail notes)
goes to `data/bookplayer/evidence/`.

- Deterministic public flow (fixtures root, after fixture fetch): `/` lists
  Alice with M4B/EPUB/VTT badges; open player; audio plays and seeks (206 in
  network log); transcript cues render, active cue tracks, cue click seeks,
  auto-scroll; EPUB opens to readable text (not full-page cover), TOC and
  prev/next work, location persists across reload; search `Rabbit` → results
  with count, click navigates with visible in-bounds highlight, results survive
  navigation and viewport switch to 390×844.
- Optional private regression (`BOOKPLAYER_ROOT=private`, corpus mounted; also
  usable ad hoc during development): 800+ books render responsively with
  pagination; home search `Use Of Weapons` → open book → EPUB search `Dizzy` →
  click result → visible highlight in bounds; highlight/location survives
  desktop→mobile reflow; rescan works.
- Geometry checks at 1440×900 and 390×844 via DOM measurement (not screenshot
  eyeballing): reader container height ≥ 60 vh desktop / ≥ 45 vh mobile,
  combined chrome 25–35 vh, iframe bounds inside reader container, no overlap
  with dock/top bar, mobile transport fully visible with all controls, mobile
  search input+submit+close visible together.

## Risks and resolved tensions

- Server-function validator method name drifts across versions — RESOLVED by
  Phase 1's proof: `.validator(...)` is current; `.inputValidator(...)` is
  deprecated on the installed 1.168.27.
- Root `tsc` vs app DOM types — resolved: root excludes the app; the app owns
  its `check` script and the root discovers member checks via
  `bun run --filter '@prosodio/*' check` (decision recorded in Architecture).
- ESLint nested-config lookup under a root run — believed default in ESLint 10;
  verified in Phase 1 with a deliberate violation; fallback is a scoped block in
  the root config.
- Seed `vitest` scripts vs monorepo `bun test` — resolved in favor of the
  repo-wide runner (Prosodio conventions outrank seed tooling recommendations);
  the seed's test _coverage_ contract is kept in full.
- Seed's always-on private library vs deterministic defaults — resolved
  (approved by Daniel): align-style root sets with exactly one active root per
  server run, selected by `BOOKPLAYER_ROOT`, defaulting to `fixtures`; selecting
  an unmounted private root fails fast.
- epub.js is old and weakly typed; search/highlight was the codex experiment's
  death. Mitigated by doing the reader spike (Phase 5) on the real Alice fixture
  before any player polish, adopting the recorded fixes (lifecycle key,
  range-CFI normalization, outer-container-only clipping), and keeping the
  epubjs API surface inside one component.
- Residual open question (one): should the landing page also surface scan
  warnings (duplicates/mismatches) beyond a count? Default recorded: count only
  in v1, details in server logs; revisit if triage pain appears.

## Phased implementation checklist

Every phase ends with the same gate, abbreviated below as CI GATE: run
`bun run ci` from the `prosodio/` root; if `fmt:check` fails run `bun run fmt`
and rerun `bun run ci`; a checkbox may be ticked only when its verification is
green — never while red, skipped, or unavailable. Update this file's checkboxes
and Status continuously (`planned` → `active` → `done`).

### Phase 1 — scaffold, workspace integration, framework proof

Outcome: `apps/bookplayer` exists as a workspace member with root-integrated
tooling, a BookPlayer shell (no starter content), and a proven server-function +
raw-Response + Range media path. Files: everything under `apps/bookplayer/`,
root `tsconfig.json`, root `package.json` (`check` script), root
`.prettierignore`.

- [x] Re-run `bunx --bun @tanstack/cli create --help`; scaffold with the
      validated flags into `apps/bookplayer` (`--no-install --no-git`); root
      `bun install`; commit `routeTree.gen.ts` policy applied
- [x] Prune scaffold: devtools, vitest/testing-library/jsdom, prettier
      config/dep, starter routes/assets/branding; rename to
      `@prosodio/bookplayer`; align scripts (`dev`/`build`/`preview`/`start`)
- [x] Root integration: tsconfig exclude + chained `check`; `.prettierignore`
      entries; verify ESLint nested lookup with a deliberate hooks violation
      (record result); verify root `bun test` sees an app smoke test
- [x] Shell: `__root.tsx` titled BookPlayer; `/` and `/player/$bookId`
      placeholder routes wired to a stub server function (no fake static data)
- [x] Framework proof: one `createServerFn` with input validation (record
      whether the installed method is `inputValidator` or `validator`) + one
      `server.handlers.GET` route serving `fixtures/audio/jfk.mp3` with Range
      support; curl-verify 200 with exact Content-Length, `bytes=0-1023` → 206
      with correct Content-Range, and 416 handling; record outputs
- [x] Build verification: `bun run build` then `bun run start` serves `/`
      (scaffold/framework-sensitive phase)
- [x] CI GATE

Phase 1 log (2026-07-03):

- Scaffolded with `@tanstack/cli` 0.59-line current flags
  (`--deployment nitro --toolchain eslint --no-examples --no-git --no-install`);
  resolved react-start 1.168.27, react-router 1.170.17, vite 8, Tailwind 4.
- `.validator(...)` is the current input-validation method (deprecation warning
  on `inputValidator`); nitro nightly alias replaced with stable-name
  `nitro@3.0.260610-beta` (self-reference broke under Bun's isolated linker);
  preset set via vite `UserConfig.nitro` — build logs `preset: bun`.
- ESLint 10 nested-lookup verified: app-level TanStack config fired a type-aware
  rule from a root run; `@tanstack/eslint-config` has NO react-hooks rules, so
  `eslint-plugin-react-hooks` was added and a deliberate conditional-useState
  probe confirmed `rules-of-hooks` errors.
- Root additions: tsconfig `exclude` (restating `node_modules` — exclude
  replaces the default list), member-check discovery in root `check` (revised
  after review from a hardcoded per-app chain to
  `bun run --filter '@prosodio/*' check`), `.prettierignore` entries,
  `@types/node` root dev dep (app's pinned copy stopped hoisting and broke
  bun-types resolution in other apps).
- curl proof: `/` 200, `/player/$bookId` 200, `/api/proof` 200 full body (76447
  bytes = file size; body streamed, so no Content-Length header on the full
  response — revisit for EPUB in Phase 4), `bytes=0-1023` → 206
  `Content-Range: bytes 0-1023/76447` with 1024-byte body, unsatisfiable → 416.
  Production `.output` server re-verified: 200 with SSR'd loader data, no dev
  artifacts, range 206.

### Phase 2 — configuration, roots, fixture cover

Outcome: `lib/config.ts` root sets with env policy; Alice fixture becomes a
canonical record. Files: `src/lib/config.ts` + test,
`apps/bookplayer/.env.example`, `fixtures/audiobooks/…/cover.jpg`,
`fixtures/manifest.jsonc` (new verified entry).

- [x] `lib/config.ts`: align-mirrored fixtures + private root sets, single
      active root via `BOOKPLAYER_ROOT` (default `fixtures`), env overrides
      (`AUDIOBOOKS_ROOT`, `VTT_DIR`), fail-fast validation of the selected root;
      `data/bookplayer/{cache,evidence}` anchored here
- [x] `config.test.ts` green (default/selection/override/invalid cases)
- [x] `.env.example` with documented keys, placeholder values only
- [x] Fetch fixtures; extract and commit Alice `cover.jpg` (provenance comment
      in `fixtures/manifest.jsonc`); verify the fixtures root now yields one
      canonical book via a scanner-precursor check or REPL
- [x] CI GATE

Phase 2 log (2026-07-03):

- The LibriVox m4b embeds no cover art (`ffmpeg -map 0:v`: no stream), so the
  plan's extract step became a fetch: the item's official album art
  (`alice_wonderland8_2106.jpg`, public domain, 300×300) is committed as
  `cover.jpg` with a full verified manifest entry (url provenance + sha256), not
  just a comment. `bun scripts/fetch-and-check-fixtures.ts` passes; the Alice
  dir now satisfies the canonical-record invariant (1 m4b + cover).
- Repo-root anchoring: `findRepoRoot(cwd)` accepts the app dir or the repo root
  (probes `fixtures/audiobooks` + `package.json`) — `import.meta.dir` is
  unreliable inside vite-bundled server code, and tests run from the repo root.
  `resolveConfig(repoRoot, env)` is pure; 9 tests green.

### Phase 3 — scanner and index

Outcome: pure scanner + index lifecycle with cache, lock, rescan, enrichment.
Files: `src/lib/{types,scan,library,ffprobe}.ts` + tests.

- [x] `lib/scan.ts` pure walk/group per contract (canonical, capabilities,
      orphans, hidden, warnings, duplicate policy, id derivation)
- [x] `scan.test.ts` green (all cases listed in Testing)
- [x] `lib/library.ts`: restore-then-revalidate, versioned cache at
      `data/bookplayer/cache/index.json`, scan lock, `refresh`, fingerprint
      gated `lib/ffprobe.ts` enrichment via `p-limit` (default 4), timing logs
- [x] `library.test.ts` green (cache, fingerprints, lock)
- [x] Manual check: dev server against fixtures root logs `[scan]` with 1 book
- [x] CI GATE

Phase 3 log (2026-07-03):

- 20 new tests (scan grouping/ids/parse + library lifecycle) green; probe is
  injectable (`createLibrary(config, probe)`) so lifecycle tests are
  deterministic with zero-byte m4bs.
- Real fixtures-root run: 1 canonical book (id `790133709c8f`, epub+vtt),
  ffprobe enrichment 63 ms (12932 s, aac, 64 kbps), cache persisted and
  fingerprint-reused on restore.
- Recorded seed deviation: the "Author - Title" basename convention beats
  embedded tags for title/author (the Alice m4b's title tag is
  "AliceWonderland8_librivox" — upstream junk); tags only fill unstructured
  basenames. Walk does not follow directory symlinks (dirent-based), which also
  keeps traversal inside the root.

### Phase 4 — server functions and media endpoints

Outcome: full server surface with security and range semantics. Files:
`src/server/library.ts`, `src/routes/api/*/$bookId.ts`, `src/lib/media.ts` +
tests.

- [x] `lib/media.ts`: `safeResolve` (realpath + separator), mime map, range
      parser (incl. suffix/open-ended), 200/206/400/404/416 builders with exact
      Content-Length and `Server-Timing`; EPUB served buffered
- [x] `media.test.ts` green (all range/traversal/error cases)
- [x] Four asset routes as thin shims; `fetchLibrary`/`fetchBook`/
      `fetchTranscript` (via `@prosodio/vtt`)/`triggerRescan` wired; lean
      payloads, no paths
- [x] `transcript.test.ts` green
- [x] curl verification against dev server on the Alice fixture: cover 200 jpeg,
      audio 206 on range, epub 200 full-body with matching Content-Length (no
      mismatch), vtt 200, invalid id 400, unknown id 404
- [x] CI GATE

Phase 4 log (2026-07-04):

- 19 new tests (safeResolve traversal/separator/symlink, range parser incl.
  suffix/open-ended/multi-range-ignore/clamping, streamed + buffered Response
  builders, transcript mapping incl. the composition flatten and the null
  no-transcript state). App total: 48.
- The Phase 1 `/api/proof` route and `health.ts` stub are gone; `/` now loads
  real `fetchLibrary` rows (full directory UX still Phase 6).
- curl on Alice (id `790133709c8f`): cover 200 jpeg 127912 = exact bytes; audio
  `bytes=0-1023` → 206 `bytes 0-1023/102704273`; epub 200 with Content-Length
  1915061 matching the downloaded byte count (no mismatch); vtt 200 (222 KB);
  invalid id → 400, unknown id → 404 structured JSON, `bytes=999999999999-`
  → 416.
- `@prosodio/vtt` compositions nest cues per segment; `loadTranscript` flattens
  them (absolute times in a valid stitched VTT).

### Phase 5 — EPUB reader spike (risk burn-down before UI polish)

Outcome: `EpubReader.tsx` proven on the real Alice EPUB — open, navigate,
search, highlight, contain — before the player page is assembled. Files:
`src/components/EpubReader.tsx`, temporary harness in the player route.

- [x] Client-only dynamic import; open via URL + `openAs: "epub"` (fallback
      arrayBuffer if needed — record which); lifecycle keyed to `epubUrl`
- [x] TOC, prev/next, CFI persist/restore; first-open cover-skip heuristic
- [x] Spine search (load/find/unload, cap 100), result list, range-CFI
      normalization, single active highlight with cleanup, stable results across
      relocation
- [x] Containment: outer clipping only (keep epub.js internal scroll math),
      iframe bounds inside container under `ResizeObserver` resize
- [x] Browser check (MCP) on Alice: open → readable text, search `Rabbit` →
      click → visible in-bounds highlight; desktop + mobile viewports; reflow
      keeps the match visible; evidence saved
- [x] Build verification (`bun run build`) — framework-sensitive phase
- [x] CI GATE

Phase 5 log (2026-07-04; evidence:
`data/bookplayer/evidence/phase5-reader-spike.md`):

- URL + `openAs: "epub"` works directly against `/api/epub/$bookId`; no
  arrayBuffer fallback needed. Lifecycle keyed to `epubUrl` only.
- Two epubjs traps found by the spike (why this phase ran early): `book.ready`
  must precede spine access, and `spine.items` are manifest entries — the
  loadable Section objects live on `spine.spineItems` (using `.items` reproduced
  the codex zero-results symptom exactly).
- Browser-verified on Alice via Claude Preview MCP: first open lands on readable
  text (href heuristic + <200-char text-density skip past the cover page); TOC
  navigates; search `Rabbit` → 37 results; result click navigates with visible
  highlight; mini-pager (n/37) advances and cleans up the previous highlight;
  desktop→375×812 reflow keeps the highlighted match on screen (the failure case
  from visual review); reload restores the saved CFI.
- Containment: iframe vertically exact inside the container; horizontally
  epub.js scrolls a wide iframe that the `overflow-hidden` container clips
  (clip-outer-only lesson) — acceptance measures the container, not the raw
  iframe rect. Known fixture artifact: the 1916 edition's decorative title
  heading overlaps body text on one transition page (book CSS vs columnizer;
  chapter pages clean).
- Reflow preservation refined: the search target is re-displayed on resize only
  while it is the last navigation intent (`resumeTarget` cleared by manual
  prev/next/TOC), so resizing never yanks the user back after they page away.
- App tsconfig gained `noUncheckedIndexedAccess` (root parity) after type-aware
  lint flagged defensive checks the looser config made "unnecessary"; fallout
  fixed across scan/media/tests.

### Phase 6 — landing page

Outcome: full directory UX on `/`. Files: `src/routes/index.tsx`.

- [x] Lean listing via `fetchLibrary`; cards with cover/title/author/duration/
      badges/progress-from-localStorage ("Not started" fallback)
- [x] Search + sort + EPUB/VTT filters (default ON, seed truth table), compose,
      persist, reset pagination on change; 24/page pagination
- [x] Loading, error, and both empty states (no private root vs zero books);
      rescan button with in-progress state
- [x] Browser check (MCP): fixtures root at both viewports — truth table spot
      checks (toggling filters changes the Alice row per its capabilities),
      pagination controls, states; evidence saved
- [x] CI GATE

Phase 6 log (2026-07-04):

- MAJOR FINDING + architectural change (recorded in Architecture above): in dev,
  `<img src="/api/cover/…">` returned vite's 404 while fetch/curl got 200 —
  nitro's dev middleware routes by `Sec-Fetch-Dest` and only sends
  asset-destination requests to routes in nitro's own routing table. The four
  asset endpoints moved from TanStack server routes to nitro handlers
  (`server/handlers/*.ts` + `nitro.handlers` in vite.config.ts); dev and
  production both verified 200/206 under image/audio fetch-dests. This would
  have broken `<audio>` in Phase 7 the same way.
- Filter/sort/search logic extracted to `lib/browse.ts` with 9 unit tests — the
  one-book fixture can't discriminate the truth table in the browser, so the
  seed contract is proven at unit level (all four states + sort orders +
  search). App tests: 57.
- Browser checks (Claude Preview): default filters ON, truth-table toggles,
  no-match state message, filter persistence in localStorage, rescan button,
  cover art rendering, mobile 375×812 layout (controls wrap, grid narrows,
  nothing clipped). Pagination controls render only above 24 books (logic
  unit-tested; browser-exercised against the private corpus in the Phase 8
  optional flow).
- `CoverImage` keeps a bounded retry + post-hydration decode check (SSR-rendered
  imgs can fail before hydration attaches onError).

### Phase 7 — player page assembly

Outcome: three-band player with full transport, transcript, budgets. Files:
`src/routes/player/$bookId.tsx`, `src/components/{Transcript,PlayerDock}.tsx`.

- [ ] Shell: single-row top bar (back, identity, TOC/nav/search inline), reader
      `flex-1` contained, bottom dock (transcript strip + transport)
- [ ] Transport: play/pause, seek slider with times, `-1m -15s +15s +1m` labels,
      speed 0.75–2.0×, volume; mobile two-row dock with all controls visible;
      keyboard transport incl. Shift; focus rings + aria-labels
- [ ] Progress: debounced audio-position save/restore; CFI already persisted
- [ ] Transcript strip: cues via `fetchTranscript`, active-cue binary search,
      click-to-seek, nearest auto-scroll, loading/error/no-VTT states; strip
      renders in all cases
- [ ] Failure isolation: audio error / reader error / both — page stays usable
      with actionable, path-free messages
- [ ] No-EPUB book remains fully playable (verify by temporarily hiding the
      fixture EPUB in a synthetic private root or temp fixture copy)
- [ ] Browser check (MCP) at both viewports: budgets measured via DOM (reader ≥
      60/45 vh, chrome 25–35 vh, containment, no clipped controls); audio
      seek/scrub/jumps/keyboard/speed/volume/resume; cue-seek; search-highlight
      reflow preservation; evidence saved
- [ ] Build verification (`bun run build`) — layout/framework-sensitive phase
- [ ] CI GATE

### Phase 8 — hardening, acceptance, handoff

Outcome: contract-complete app with recorded evidence. Files: touch-ups only;
`apps/bookplayer/README.md` (TODO/Operations/Setup/Context per repo doc style).

- [ ] Observability audit: `[scan]`/`[probe]`/`[media]` logs with counts and ms;
      `Server-Timing` present on all four asset routes + rescan
- [ ] Accessibility pass: tab order, visible focus on all controls and cards,
      aria-labels on icon buttons, transcript cues focusable
- [ ] App README written; `.env.example` final; this plan's decisions that
      became durable operational facts land in the README, not re-explained here
- [ ] Production: `bun run build` + `bun run start` full public flow smoke
- [ ] Full deterministic public-fixture acceptance run (list below) with
      evidence in `data/bookplayer/evidence/`
- [ ] Private regression run if the corpus is mounted (else record "not mounted,
      skipped" — do not fake it)
- [ ] Confirm no Playwright dependency was added to `apps/bookplayer`
      (`bun pm ls` / package.json inspection recorded)
- [ ] CI GATE; final diff review: only intended files changed
- [ ] Tick the backlog/plan closure per docs/WORKFLOW.md; Status: done

## Final acceptance checklist

Requirement-traceable; every line needs recorded evidence (command output, DOM
measurement, or screenshot path under `data/bookplayer/evidence/`).

- [ ] Root `bun run ci` green; `bun run build` + `bun run start` serve the app
- [ ] Deterministic public-fixture flow passes end-to-end (Alice: list → player
      → audio → transcript → EPUB → search `Rabbit` → highlight)
- [ ] Private regression (when mounted): search `Use Of Weapons` → EPUB search
      `Dizzy` → result click navigates with visible in-bounds highlight; results
      stable after navigation; 800+ book listing responsive
- [ ] `/` and `/player/$bookId` verified at 1440×900 and 390×844
- [ ] Reader geometry: containment (iframe inside bounds, no chrome overlap) and
      budgets measured — reader ≥ 60 vh desktop / ≥ 45 vh mobile, chrome 25–35
      vh, no hard-fail thresholds crossed
- [ ] Audio: range seek (206 observed), scrub, ±15s/±1m buttons, keyboard
      transport incl. Shift, speed, volume, resume-from-saved-position; no-EPUB
      book fully playable at `/player/$bookId`
- [ ] Transcript: strip always present; no-VTT state; active cue tracks
      playback; cue click seeks; auto-scroll follows
- [ ] EPUB: TOC navigation, prev/next, location persists across reload; search
      result navigation with visible in-bounds highlight that survives
      relocation and viewport reflow without resetting results
- [ ] Landing: filter truth table (4 states), pagination reset on
      filter/search/sort change, rescan button, cache restore on restart,
      fingerprint-driven re-probe on touched file, background enrichment logs
- [ ] Security/media tests green: traversal, separator-prefix, symlink escape,
      invalid id, unknown id, missing file, malformed range, suffix range,
      content-length consistency on EPUB (no `ERR_CONTENT_LENGTH_MISMATCH`)
- [ ] Accessibility: keyboard-only pass of both pages with visible focus
- [ ] Evidence paths recorded; nothing private-corpus-derived committed
      (`git status` clean of `data/` and screenshots)
- [ ] No Bookplayer-local Playwright/`@playwright/test` dependency present

## Definition of done

Root CI and a production build are green; every automated test above exists and
passes; the deterministic public-fixture acceptance flow has recorded browser
evidence (private flow run or explicitly recorded as unavailable); both routes
meet the reader-first budgets at desktop and mobile; the backlog is ticked and
this plan's Status is `done` with no unchecked box left silently incomplete.
