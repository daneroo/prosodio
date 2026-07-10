# Locate sweep

What the bookplayer "locate sweep" verifies, and what an `ok` means. It is a
sanity check on the **DOM-path → epubcfi** path — the join between a matched
token's server-captured EPUB address and a working epub.js locator in the
browser. Dev-only; never in CI (needs a browser and a served book).

Code: `apps/bookplayer/src/lib/locate-sweep.ts` (`sweepBook`). Pages:
`/dev/locate/:bookId` (one book), `/dev/sweep` (whole corpus). Design context:
`thoughts/design/bookplayer-align-refine-model.md` ("The DOM path", ladder L3).

## Scope

- Runs entirely client-side, in the same browser code path the reader uses —
  epub.js is dynamic-imported into the page and parses each section with the
  browser's own DOMParser (mime by file extension). It is the real runtime, not
  a simulation.
- Does NOT render the book to screen — no `rendition.display`. It stops at
  proving the cfi is generatable and round-trippable; visual navigation/paint is
  the player's job, not the sweep's.
- Restricted to MATCHED tokens: the union of accepted alignment span ranges
  (`artifact.match.spans`), grouped by spine. Unmatched book text is not checked
  (could be generalized to all normalized EPUB tokens later — see BACKLOG).

## What one `ok` means

For each matched EPUB token, against the epub.js-parsed section document, all
of:

1. path — the captured DOM locator (`segPaths` + seg/offset columns) resolves to
   a `Range` (`diagnoseRangeFromDomPath`).
2. text — `normalize(range.toString())` equals
   `normalize(tokenRaw(vtt, vttSeq))`, the ALIGNED narration word (via the
   span's vtt↔epub mapping). This confirms the located range holds the matched
   content, not just any text.
3. cfi — `section.cfiFromRange(range)` produces an epubcfi.
4. roundtrip — `new EpubCFI(cfi).toRange(document)` returns a range whose text
   equals step 2's. This confirms the cfi is valid and self-consistent.

Any step failing → the token is counted `failed` with that step recorded (first
20 per section kept for triage). Section-level parity (L2) is recorded alongside
but does not gate the per-token loop — the sweep MEASURES, it does not
short-circuit.

## Report

`SweepReport`:
`{ bookId, totals { sections, tokens, ok, failed }, sections[] }`. Each section
carries `parseMode`, `extensionPredictedMode` (a mismatch predicts parity risk —
see design D10), parity result, and capped `failures`. Persisted as
`data/bookplayer/cache/<bookId>.sweep.json` via `PUT /api/sweep/:bookId`;
`/dev/sweep` reads the index (`GET /api/sweep`) and re-runs on demand.

## Interpreting results

- clean = `failed 0`; zero-ok = `ok 0 && tokens > 0` (locators structurally
  broken for the whole book); partial = some failed.
- A `path` failure with `parseMode` ≠ `extensionPredictedMode` is the
  parser-mode mismatch class (fixed 2026-07-10, extension-driven parsing).
- A `path` failure where both are equal is a deeper parity divergence (e.g.
  document-prolog differences on Calibre `.html`) — see BACKLOG
  `bookplayer-calibre-html-locate`.
