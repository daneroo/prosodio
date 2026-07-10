# bookplayer-locate-hardening — extension parse-mode fix + /dev/sweep

Status: DONE (2026-07-10) — Phases 0-3 complete. Corpus Run-all: 93 books, 91
clean, 11,331,717/11,452,365 matched tokens ok; the mismatch class this plan
fixed is gone. One NEW residual class (two Calibre `.html` books) diagnosed and
split to BACKLOG `bookplayer-calibre-html-locate` per this plan's guardrail. CLI
reports re-baselined by Daniel. Remaining: merge + archive this plan and the
predecessor together (Daniel's sign-off).

Predecessor:
[bookplayer-align-refine-model.md](bookplayer-align-refine-model.md) (DONE,
merged). This plan consumes its sweep evidence: fix the one measured cause of
locate failure across the private corpus, and turn the L3 sweep into a
persistent, self-serve corpus tool. Same execution model: coding tasks delegated
to lower-power subagents, orchestrator reviews/CI/commits, sequential, `[tier]`
hints per task. Rules carried verbatim from the predecessor plan (CI before
commit, stage specific files, private corpus never in CI, one root per server
run).

## Evidence (Daniel's 39-book corpus sweep, 2026-07-09)

- 12 books fully clean, 5 partial, 22 zero-ok.
- EVERY failing section — 638 of 849 — fails parity with `seg-path-failed` at
  `firstDivergentSeg: 0`, and every one is `parseMode: "xhtml"` with
  `extensionPredictedMode: "html"`. Zero `seg-length-mismatch`, zero
  text/cfi/roundtrip failures anywhere in the corpus.
- Failure detail: browser-side doctype/comment nodes sit where the
  server-captured path expects `<html>` — root-level tree divergence, so every
  path in the section dies at step one.
- Root cause (design D10, now proven): those spine files are named
  `.html`/`.htm`. epub.js picks its parser BY EXTENSION (`archive.js`: `.xhtml`
  → `application/xhtml+xml`, `.html`/`.htm` → `text/html`); our extraction
  picked BY CONTENT (XML-first). Well-formed XHTML in a `.html` file → server
  parses XML, browser parses HTML → different trees.
- Partial books (e.g. Gardens of the Moon 187,220 ok / 782 failed) are
  mixed-extension: their failures live entirely inside `.html` sections; their
  `.xhtml` sections are clean. No second failure class is visible in the data —
  but verification below must CONFIRM partials go fully clean, and anything
  surviving the fix outside the malformed-xhtml class is a new class to triage,
  not noise.
- Clean books (Alice, Earthsea 01-04, Hainish, Frost, Malazan 09) are
  all-`.xhtml`: both parsers take the XML path.

## How the sweep actually works (concrete; no automation dependency)

There is no server-side browser and no playwright anywhere in the repo. The page
you open IS the test runtime:

```
Your browser tab, visiting /dev/locate/:bookId (or /dev/sweep)
  └─ the bookplayer client bundle's own JS
      ├─ fetch /api/alignment/:bookId    ← artifact (server computes on
      │                                    first request, then disk cache)
      ├─ dynamic import("epubjs")        ← epub.js instantiated IN THE PAGE
      ├─ fetch /api/epub/:bookId         ← epub bytes into epub.js Archive
      ├─ per section: the browser's native DOMParser parses the section
      │   (mime chosen by epub.js from the file extension), then
      │   checkSectionParity → diagnoseRangeFromDomPath → text guard →
      │   section.cfiFromRange → EpubCFI round-trip
      └─ report → window.__locateSweepReport (and, this plan: POSTed to
         the server for persistence)
```

That in-page placement is the point of L3: the sweep exercises the exact parser
and epub.js code paths the real reader uses. Daniel's out-of-repo script used
playwright ONLY as a page-driver (open 39 URLs from a terminal, poll
`window.__locateSweepReport`); the orchestrator's browser tooling did the same
one book at a time. The /dev/sweep page removes the need for any driver: it
loops the library in-page and persists each finished report server-side.
Playwright stays OUT of the repo; adopting it is a separate e2e-harness
decision, explicitly deferred (Daniel's ruling).

## Decisions (proposed — marked, not asserted)

- H1 Extraction parse mode becomes extension-driven, mirroring epub.js:
  `.xhtml`/`.xht` → XML-first (lenient-HTML fallback on malformed XML, as
  today); `.html`/`.htm` → HTML parser DIRECTLY (even when the content is
  well-formed XML — matching the browser matters more than parser purity); any
  other extension → XML-first (rare; stays content-driven). This RESOLVES
  BACKLOG `align-epub-parser-decisions` with corpus evidence.
- H2 `ParseMode` gains a value: `"xhtml" | "html" | "html-fallback"` — `html` =
  extension-selected HTML parse (browser-matching, expected parity-clean);
  `html-fallback` keeps its meaning (wanted XML, content was malformed —
  predicted parity risk, since epub.js will get an XML parsererror tree for that
  section).
- H3 Schema/version consequences: artifact spines enum + config echo change →
  `ALIGNMENT_ARTIFACT_SCHEMA_VERSION` bumps to 3, which invalidates every
  artifact cache via the key sidecar (regeneration is the point — the extraction
  changed). Config echo literal `"xhtml-or-html-fallback"` → `"by-extension"`.
  CLI reports on `.html` books change (extraction input changed → spans/metrics
  may shift) and re-baseline ONCE; Alice and all other pure-`.xhtml` books must
  be byte-identical — that is the no-regression check.
- H4 Sweep reports persist server-side as
  `data/bookplayer/cache/<bookId>.sweep.json` (`{ generatedAt, report }` —
  wall-clock allowed here: diagnostics, not a determinism-contract artifact; dir
  is gitignored). Written by the page via `PUT /api/sweep/:bookId`; read back
  via `GET /api/sweep/:bookId` and the index `GET /api/sweep`. No auth/gating
  server-side (local single-user app, gitignored data); the PAGES stay
  dev-gated.
- H5 /dev/locate also auto-persists its report on completion (same PUT), so
  single-book re-runs refresh the corpus summary without a full sweep.

## Phase 0 — branch + plan (orchestrator)

- [ ] Branch `bookplayer-locate-hardening` off main; this plan committed.

## Phase 1 — the fix

### T1.1 Extension-driven parse mode `[tier: med]`

Files: `packages/align/src/epub-extract.ts` (+test),
`packages/align/src/artifact.ts` (+test),
`packages/align/src/section-parity.test.ts` (call-site only, if
parseContentDocument's signature changes there),
`packages/align/src/epub-extract.roundtrip.test.ts` (mode-aware re-parse),
`apps/align/lib/report.ts` (+test: config echo literal),
`apps/bookplayer/src/lib/locate-sweep.ts` (ONLY if its extensionPredictedMode
helper should be reused/aligned — read it; keep its behavior).

- `epub-extract.ts`:
  - `export function parserPreferenceForHref(href: string): "xml-first" | "html"`
    — `.xhtml`/`.xht` (case-insensitive) → `"xml-first"`; `.html`/`.htm` →
    `"html"`; anything else → `"xml-first"`. One place, exported (the sweep page
    and tests may reuse it).
  - `parseContentDocument(html, prefer)` — `"html"` → straight `text/html`
    parse, mode `"html"`; `"xml-first"` → today's behavior (XML attempt,
    fallback mode `"html-fallback"`).
  - `projectVisibleText(html, excludedElements, prefer = "xml-first")` — default
    preserves existing callers/tests; `extractEpub` passes
    `parserPreferenceForHref(spineHref)`.
  - `ParseMode` = `"xhtml" | "html" | "html-fallback"` (H2).
  - `ExtractionConfig.parseMode` literal → `"by-extension"`.
- `artifact.ts`: spines parseMode enum gains `"html"`; config echo literal
  updated; `ALIGNMENT_ARTIFACT_SCHEMA_VERSION = 3` (schemaVersion literal in the
  schema/type follows).
- `apps/align/lib/report.ts`: config echo zod literal → `"by-extension"`.
- Tests:
  - well-formed-XML content in a `.html`-preferred parse → `parseMode: "html"`
    and an HTML-parsed tree (assert a structural marker that differs between the
    two parsers if feasible; at minimum the mode);
  - `.xhtml` well-formed → `"xhtml"` (unchanged); `.xhtml` malformed →
    `"html-fallback"` (unchanged);
  - Alice extraction: every included spine doc still `"xhtml"` — and the built
    artifact for Alice differs from schema-v2 ONLY in `schemaVersion` + config
    echo literal (fixtures are pure `.xhtml`, so tokens/spans must not move —
    assert deep-equality of the match block against a pre-change build if
    practical, else spot-assert spanCount/coverage metrics unchanged);
  - L1 roundtrip test re-parses each section with
    `parserPreferenceForHref(href)` (mode-aware) and still passes end-to-end
    with parse-mode determinism per doc.
- Done: root `bun run ci` green.

### T1.2 Orchestrator verification of the fix (no delegation)

- [x] DONE 2026-07-10, all five at 100% with zero bad sections: Kafka on the
      Shore 171,447/171,447 (was 0); Consider Phlebas 159,851/159,851 (was 0);
      Gardens of the Moon 188,002/188,002 (was 187,220 + 782 failed); Tales From
      Earthsea 92,778/92,778 (was 8); Earthsea 01 control 56,783/56,783 (still
      clean). No html-fallback residuals in these five. v3 recompute proved
      cheap: ~1-2s per book (Kafka 171k tokens in ~1s), so the post-upgrade "Run
      all" cost concern is retired. Kafka's spine modes now read html:5/xhtml:1
      — the browser-matching parse landing as designed.
- [x] Fixtures control: Alice pinned by CI (L1 roundtrip 13,290 tokens / 30 docs
      unchanged, all-.xhtml).

Phase 1 commit.

## Phase 2 — sweep persistence + corpus page

### T2.1 Sweep store + endpoints `[tier: med]`

Files: new `apps/bookplayer/src/lib/sweep-store.ts` (+test), new
`apps/bookplayer/server/handlers/sweep.ts`, `apps/bookplayer/vite.config.ts`
(handler entries).

- `sweep-store.ts` (pure/testable, node fs allowed — server-side lib):
  - `sweepPath(config, bookId)` → `data/bookplayer/cache/<bookId>.sweep.json`;
  - `readSweep(path)` → `{ generatedAt: string; report: SweepReport } | null`
    (corrupt/missing → null, never throws);
  - `writeSweep(path, report)` → wraps with
    `generatedAt: new Date().toISOString()`;
  - `validateSweepBody(bookId, body)` → structural sanity, not zod-heavy:
    body.report.bookId === bookId, totals present with numeric
    sections/tokens/ok/failed, sections is an array; reject > 32 MB;
  - `sweepIndex(config)` → for each id with a stored file:
    `{ bookId, generatedAt, totals }` (totals only — never ship every section
    detail in the index).
- `handlers/sweep.ts` (thin adapters, vtt.ts/alignment.ts pattern):
  - `GET /api/sweep` → index for all `*.sweep.json` in the cache dir;
  - `GET /api/sweep/:bookId` → stored file bytes or 404;
  - `PUT /api/sweep/:bookId` → validate via sweep-store, write, 204. (Method:
    PUT — idempotent replace; register one handler route and branch on
    `event.req.method` if nitro route entries are method-blind — check how
    existing handlers receive method, mirror it.)
- Tests: store round-trip, corrupt file → null, validate rejections (id
  mismatch, missing totals, oversized), index skips corrupt files.
- Done: root `bun run ci` green.

### T2.2 /dev/locate auto-persist `[tier: low]`

Files: `apps/bookplayer/src/routes/dev.locate.$bookId.tsx`.

- On sweep completion, `PUT /api/sweep/:bookId` with the report (fire-and-forget
  with a small "saved"/"save failed" note in the UI); keep
  `window.__locateSweepReport`. Add a link to `/dev/sweep`.
- Done: CI green (type-check).

### T2.3 /dev/sweep corpus page `[tier: med]`

Files: new `apps/bookplayer/src/routes/dev.sweep.tsx`,
`apps/bookplayer/src/routeTree.gen.ts` (regenerate via the project's route-gen
script if type-check requires).

- Dev-gated like dev.locate. Data on load: `fetchLibrary()` (existing server fn)
  filtered to `hasEpub && hasVtt`; `GET /api/sweep` for stored results; merge
  into one table sorted by title.
- Table columns: title (link to `/dev/locate/:id`), sections, ok, failed,
  tokens, ok% and generatedAt from the stored result (em-dash when none), live
  status cell.
- Controls: "Run missing" and "Run all" (sequential, ONE book at a time —
  epub.js instances are heavy; create per book inside `sweepBook`, which already
  destroys the Book when done), per-row "Run". A run: `fetchArtifact` →
  `sweepBook(artifact, /api/epub/:id, onProgress)` → PUT → update row.
- Progressive display ("sweep in action"): the running row shows a live section
  counter + current href from onProgress, and a running ok/failed tally;
  completed rows update in place; a footer accumulates corpus totals (books
  clean/partial/zero-ok, token sums). Expose the merged summary as
  `window.__sweepSummary` for scripting.
- Cold-cache honesty: the first "Run all" after the schema-v3 upgrade recomputes
  every artifact server-side (the fetch simply takes long per book — surface
  "computing alignment…" in the status cell while the artifact fetch is in
  flight). Steady-state corpus sweep is ~5 min for 39 books (Daniel's
  measurement); the post-upgrade first run adds full alignment recompute on top
  — kick it off and let it run.
- Abort: a "Stop" button that halts after the current book (a simple cancelled
  flag checked between books; mid-book abort is not required).
- Done: CI green; orchestrator browser-verifies on fixtures (Alice row runs,
  persists, reloads from disk on refresh).

### T2.4 Player dev link `[tier: low]`

Files: `apps/bookplayer/src/routes/player/$bookId.tsx`.

- `import.meta.env.DEV`-gated small link in the player top bar (near the
  alignment toggle) → `/dev/locate/:bookId`. Style: quiet, matches existing
  top-bar buttons. Done: CI green.

Phase 2 commit.

## Phase 3 — corpus acceptance + docs

- [x] Daniel: `/dev/sweep` → "Run all" on the private root. RESULT 2026-07-10,
      93 books / 11.45M matched tokens: 91 books 100% ok, 11,331,717 ok. NO
      `html-fallback` residuals. Two Calibre-converted `.html` books are the
      only exceptions and form a NEW class (below), not the mismatch this plan
      fixed. Previously-partial books (Gardens of the Moon, Tales From Earthsea,
      etc.) confirmed fully clean.
- [x] Residual triage (orchestrator, 2026-07-10): the two exceptions are Snuff
      (`85e54f4414d1`, swept 0/120,648 — document-prolog off-by-one in html/html
      sections) and I Shall Wear Midnight (`bd2c61260300`, sweep crashed on a
      degenerate section document). Both diagnosed and filed as BACKLOG
      `bookplayer-calibre-html-locate` with root cause + candidate fixes. Per
      this plan's own guardrail, NOT fixed inline — a scoped follow-up (the
      documentElement-anchoring fix is schema-changing).
- [x] Daniel: CLI corpus revalidation — DONE. Daniel re-ran and checked in new
      baselines in the gitignored nested report repos
      (`apps/align/reports/.git`, `apps/epub-validate/reports/.git`), also
      absorbing newly transcribed/aligned corpus additions. Retires the
      revalidation item folded in from the predecessor plan.
- [x] Docs: bookplayer README + BACKLOG updated (P3 docs commit);
      `docs/LOCATE-SWEEP.md` added documenting what the sweep verifies and what
      an `ok` means.
- [ ] Archive this plan AND the predecessor together after Daniel's sign-off
      (final corpus numbers recorded above).

## Non-goals

- Playwright / any e2e harness — separate decision, deferred (Daniel).
- Fixing malformed-xhtml (`html-fallback`) sections — expected-unlocatable by
  design; revisit only if a wanted book is dominated by them.
- Matcher changes, packed columns, excerpt-search fallback.

## Acceptance

- Corpus sweep: previously zero-ok and partial books at 100% ok outside
  `html-fallback` sections; fixtures (Alice) unchanged at 9,343/9,343 and
  byte-stable in the match block.
- Sweep reports persist as `<bookId>.sweep.json`; `/dev/sweep` shows the whole
  corpus with progressive live runs; `/dev/locate` auto-persists; player links
  to its book's sweep in dev.
- No new runtime dependencies; playwright absent.
- Root CI green throughout; reports re-baselined once with the expected scope of
  change.
