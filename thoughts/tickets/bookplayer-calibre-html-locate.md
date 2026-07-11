# bookplayer-calibre-html-locate — two Calibre `.html` EPUBs sweep 0-ok

A NEW failure class (not the fixed predicted-mode mismatch), surfaced by the
full-corpus sweep 2026-07-10 (93 books; these are the only two non-clean).

books: Terry Pratchett — Discworld 39 Snuff (`85e54f4414d1`) and Discworld 38 I
Shall Wear Midnight (`bd2c61260300`). Both Calibre output (spine files
`chapter_001.html`, `.html_split_006`, `temp_calibre_*`).

- symptom A (Snuff, 0/120,648 ok): every section `parseMode: "html"` AND
  extension-predicted `"html"` (no mode mismatch), yet `seg-path-failed` at
  `firstDivergentSeg: 0`. Server path `[0, …]` expects `<html>` at
  `document.childNodes[0]`; the browser's parse has a leading `#comment` at
  index 0, shifting `<html>` to 1 — every path off-by-one at the root. jsdom and
  the browser diverge on the document PROLOG even when both HTML-parse.
- symptom B (Midnight): originally crashed the sweep; the crash guard
  (2026-07-10, `resolveNodeAtPath` childNodes guard + per-section catch in
  `sweepBook`) fixed the tooling. Now sweeps to completion — 18 sections,
  103,502 tokens, all `seg-path-failed` — i.e. the SAME class as symptom A.

Resolution options (Daniel's call):

- REPLACE the books (Daniel, 2026-07-10): we always expected a few EPUBs too
  badly-formed to accommodate. Re-source or re-convert to clean `.xhtml` (or
  non-prolog-polluted `.html`); the rest of the Discworld set already passes.
  Cheap, corpus-specific, no code change.
- FIX generally (schema-affecting): anchor DOM paths at
  `document.documentElement` instead of the raw `document` node, in capture
  (`epub-extract.ts projectVisibleText`) and resolve (`epub-dom-path.ts`,
  `section-parity.ts`). Prolog-invariant paths; would fix A and harden against
  the next such book. Costs `ALIGNMENT_ARTIFACT_SCHEMA_VERSION` bump + cache
  regen + reports re-baseline + full corpus re-sweep. Its own scoped change.
- if replace is taken, the anchoring fix drops to optional general robustness.

relates: `epub-calibre-pollution-audit` (Calibre already a corpus-quality
hazard), `align-better-fixture-pair`.
