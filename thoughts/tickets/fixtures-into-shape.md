# fixtures-into-shape — make the public fixtures respectable

why: the committed fixtures are bad on every axis at once — bad pairs, bad tags,
bad provenance. They were the "worst-case demonstrators" that misled the
original metadata code (see `docs/corpora/metadata.md`). Absorbs
`align-better-fixture-pair` (closed 2026-07-19) and metadata plan S5.

Goal: >=2 faithful public narration<->edition pairs, clean canonical m4b tags,
recorded provenance. Unblocks `bookplayer-public-acceptance`; feeds metadata
S1-S5 testing (clean AND junk cases both wanted).

- ACTIVE: Daniel is assembling a Beatrix Potter set ("a series of rabbits") —
  public domain, short, and a real SERIES, so it also exercises the new
  `series[]` metadata (`grouping` tag) that the private corpus only covers 23%
  of. Capture tag conventions when committing.
- faithful-pair problem (from align-better-fixture-pair): the committed Alice
  epub (Gutenberg #19033, illustrated) is an ABRIDGED retelling (~13.3k words;
  no Mock Turtle / Gryphon / Lobster Quadrille) while the LibriVox narration
  reads the full text (~27.5k words); its 34% VTT coverage is "correct" only
  because half the book is missing. Both bookplayer and align consume the pair
  (canonical record + EPUB search acceptance;
  [decision record](../plans/archive/bookplayer.md)); keep bookIds stable when
  swapping files.
- open puzzle (diagnose or drop with the swap): LibriVox v8 cites Gutenberg #11;
  real #11 is full (~26.5k words, has the Mock Turtle). Daniel swapped in #11
  and reportedly got the SAME ~34%/70%, which should be impossible for a
  full-text epub (expect ~90% like the 34 real books). Did the swap take effect,
  or did that #11 under-extract? Capture the exact #11 epub + token count if
  kept.
- re-tag the m4bs (was metadata plan S5): Alice's title tag is the LibriVox junk
  `AliceWonderland8_librivox`; `jfk.m4b` is all-null. Decide per fixture: clean
  tags for the faithful pairs, but KEEP at least one junk-tagged and one tagless
  fixture on purpose — they are the test cases for the basename-fallback finding
  and "present but garbage" display. Re-tagging changes sha/fingerprint
  (re-probe fires); bookId is basename-derived, unaffected.
- provenance: record source + sha for every fixture file when touched
  (`provenance.md`); watch for Calibre bookmark pollution
  (`epub-calibre-pollution-audit`) — never open fixtures in the Calibre viewer.

relates: `align-known-mismatch-convention` (the abridged pair is its live
fixture case), `metadata-canonical-from-tags` (S5 absorbed here),
`bookplayer-public-acceptance` (unblocked by this).
