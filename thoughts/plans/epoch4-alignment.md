# epoch4-alignment — Alignment research

Goal: design the synchronization engine fresh, informed by the now-real
transcription and EPUB APIs.

- [ ] Port or mine `audio-deno-match`, `chapter-marks-match` under Bun
      (candidates, not mature alignment architecture).
- [ ] Define evaluation corpora and metrics before selecting an algorithm.
- [ ] Develop the word-level alignment contract in a dedicated plan. Its
      location model, metrics, and confidence representation are premature here.

Player, finder, TTS, and search remain later capability decisions, not implied
members of an initial release.
