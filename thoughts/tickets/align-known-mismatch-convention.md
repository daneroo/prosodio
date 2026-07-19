# align-known-mismatch-convention — mark legitimately non-faithful pairs

why: low coverage must read as "known mismatch", not pipeline failure. Live
cases: A Wizard of Earthsea BBC dramatization vs the original ebook (27%/5.8%);
the Alice abridged epub vs full narration (34% vtt). CONTRAST: the rabbit
fixtures (2026-07-19) show a faithful pair can also read low on book% for a
purely structural reason (narration 86-91% but book 22-25%, the Gutenberg
license spine flagged `zero`) — the convention must distinguish these
signatures.

- the marker — Daniel's direction (2026-07-19): file-naming KEYWORD CUES on
  unmatched/mismatched epubs — e.g. `Omnibus`, `reference`, `abridged` — plus
  how discovery/pairing and the lab surfaces interpret them. Not designed yet;
  needs the how-to-name conversation.
- practice ground: Daniel may add Alice (full m4b, retagged clean) to the
  PRIVATE corpus paired with the abridged epub — the first deliberately marked
  specimen.
- fixtures Alice stays junk-TITLED on purpose (the present-but-garbage metadata
  case, docs/corpora/metadata.md; author tag is clean). The fetched 98MB m4b's
  manifest sha pins the exact upstream bytes — never retag it in place; a fresh
  checkout would fetch the untagged original anyway.
- open puzzle (inherited from fixtures-into-shape): LibriVox v8 cites Gutenberg
  #11; real #11 is full (~26.5k words, has the Mock Turtle). Daniel swapped #11
  in and reportedly got the SAME ~34%/70%, which should be impossible for a
  full-text epub (expect ~90%). Diagnose: did the swap take effect, or did that
  #11 under-extract? Capture the exact epub + token count.

relates: `corpora-omnibus-mapping` (omnibus is one cue class; RabitRemix plans a
"Fixture Rabbits 00" Gutenberg #582 omnibus fixture), `fixtures-into-shape`
(closed 2026-07-19; this ticket absorbed its mismatch threads).
