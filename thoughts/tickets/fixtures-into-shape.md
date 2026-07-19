# fixtures-into-shape — make the public fixtures respectable

why: the committed fixtures are bad on every axis at once — bad pairs, bad tags,
bad provenance. They were the "worst-case demonstrators" that misled the
original metadata code (see `docs/corpora/metadata.md`). Absorbs
`align-better-fixture-pair` (closed 2026-07-19) and metadata plan S5.

Goal: >=2 faithful public narration<->edition pairs, clean canonical m4b tags,
recorded provenance. Unblocks `bookplayer-public-acceptance`; feeds metadata
S1-S5 testing (clean AND junk cases both wanted).

- LANDED 2026-07-19: the "Fixture Rabbits" series (Peter Rabbit #1, Benjamin
  Bunny #4, Flopsy Bunnies #6 — deliberately non-contiguous positions) is
  committed under `fixtures/audiobooks/`, m4bs included (gitignore negation;
  5-10MB each, purpose-produced, no upstream to refetch). Manifest carries all
  12 files with sha256; audio remixed from LibriVox "The Tale of Peter Rabbit
  and Others" (source sha256s in the RabitRemix staging area); epubs are the
  UNTOUCHED illustrated Gutenberg editions (#14838/#14407/#14220). Verified live
  on the fixtures root: tags win over basenames, series positions 1/4/6 parse,
  epubMatch exact on all three, findings 0.
- REMAINING (from the RabitRemix TODO + this landing):
  - ~~no `composer` tag~~ RESOLVED 2026-07-19: Daniel retagged with the real
    per-track narrators (Julian Pratley #1, Jenn Broda #4, Michael Maggs #6) —
    fixtures now exercise per-book narrator variety; Alice/jfk keep the
    null-narrator cases. m4b + sidecar pins re-pinned.
  - epub Calibre cleanup pass never ran — committed epubs are raw Gutenberg
    (boilerplate present). NOW QUANTIFIED (first alignment baselines,
    2026-07-19, tiny.en VTTs): Peter 89.0%/22.0%, Benjamin 91.4%/25.2%, Flopsy
    85.8%/21.6% (narration/book). The low book% is ENTIRELY the Gutenberg
    license spine — Peter's story spine matches 79.1% with 26 anchors while the
    3014-token license spine sits at 0% (flagged `zero`) and is ~72% of the
    epub. Cleanup would lift book% to the story-spine ratio (~79%+); a bigger
    whisper model would lift narration%. Swap = manifest re-pin, bookId stable.
  - ~~no VTTs yet~~ RESOLVED 2026-07-19: Daniel transcribed all three (whisper
    tiny.en, ~5s/book); committed to `fixtures/transcriptions/` +
    manifest-pinned (Alice's pre-existing VTT pinned too). Both roots show
    vtt=exact on all rabbits. Note tiny.en transcript quality may cap alignment
    coverage — regenerate with a larger model + re-pin if the rabbit alignment
    baselines look weak.
  - the combined Gutenberg #582 omnibus ("Fixture Rabbits 00") is planned in
    RabitRemix — would become the `corpora-omnibus-mapping` fixture.
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
