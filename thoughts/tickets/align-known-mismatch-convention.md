# align-known-mismatch-convention — validation exceptions/expectations

why: low coverage must read as "known mismatch", not pipeline failure. Reframed
(Daniel, 2026-07-19) as part of the VALIDATION flow: validations accumulate
declared exceptions/expectations as we find them, and known non-faithful pairs
are the first class. Live exemplar: the Alice abridged epub vs full narration
(~34% vtt — an abridged/unabridged mismatch, settled; the earlier Gutenberg #11
"puzzle" was the same thing). Also: A Wizard of Earthsea BBC dramatization vs
the original ebook (27%/5.8%).

CONTRAST the rabbit fixtures (2026-07-19): a faithful pair can also read low on
book% for a purely structural reason (narration 86-91%, book 22-25%, the
Gutenberg license spine flagged `zero`) — the mechanism must distinguish these
signatures.

- the marker — direction: file-naming KEYWORD CUES on unmatched/mismatched epubs
  — e.g. `Omnibus`, `reference`, `abridged` — plus how discovery/pairing, the
  lab surfaces, and the future validator interpret them (an expectation converts
  a would-be failure/warning into an acknowledged state). Not designed yet;
  needs the how-to-name conversation.
- practice ground: Daniel may add Alice (full m4b, retagged clean) to the
  PRIVATE corpus paired with the abridged epub — the first deliberately marked
  specimen.
- fixtures Alice stays junk-TITLED on purpose (the present-but-garbage metadata
  case, docs/corpora/metadata.md; author tag is clean). The fetched 98MB m4b's
  manifest sha pins the exact upstream bytes — never retag it in place; a fresh
  checkout would fetch the untagged original anyway.

relates: `corpora-omnibus-mapping` (omnibus is one cue class),
`merge-nx-audiobook-validation` (exceptions/expectations belong to the same
validation flow the parity rules land in).
