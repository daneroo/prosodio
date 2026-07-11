# align-better-fixture-pair — replace Alice; want >=2 faithful public pairs

why: the committed Alice epub (Gutenberg #19033, illustrated) is an ABRIDGED
retelling (~13.3k words; no Mock Turtle / Gryphon / Lobster Quadrille) while the
committed LibriVox narration reads the full text (~27.5k words). 34% VTT
coverage is "correct" only because half the book is missing — a poor reference
for a public e2e fixture.

- a SHARED concern, not just align's: `apps/bookplayer` is a second consumer of
  the public pair (canonical record + EPUB search acceptance;
  [decision record](../plans/archive/bookplayer.md)). Keep the id stable when
  swapping.
- open puzzle: LibriVox v8 cites Gutenberg #11; real #11 is full (~26.5k words,
  has the Mock Turtle). Daniel swapped in #11 and reportedly got the SAME
  ~34%/70%, which should be impossible for a full-text epub (expect ~90% like
  the 34 real books). Diagnose: did the swap take effect, or did that #11 file
  under-extract (~13k tokens would explain 70% epub coverage)? Capture the exact
  #11 epub used + its extracted token count.
- goal: >=2 faithful narration<->edition pairs for a trustworthy baseline;
  unblocks `bookplayer-public-acceptance`.
