# player-sync-core — one sync model for the player

why: sync state is smeared across views — playback position flows player ->
Transcript -> AlignmentViewer -> EpubReader, and reader follow only works while
the alignment panel is open (v1 limitation recorded at
`bookplayer-alignment-layout` close). The debug panels are load-bearing when
they should be optional subscribers. Accidental complexity, accreted per
feature.

Direction:

- one canonical sync state — playhead <-> matched span <-> book location — owned
  by the player route, not by any panel.
- views (Transcript, AlignmentViewer, EpubReader, PlayerDock) subscribe and
  command it; any panel can be closed without breaking follow.
- reverse sync, EPUB -> audio: double-click a word in the reader; resolve the
  clicked Range back through segPaths to an epubSeq -> matched span -> VTT time
  -> seek. Feasibility rests on the locate-hardening result (93/93 corpus sweep,
  locators proven round-trippable both ways).
- unmatched-word click policy (snap to nearest span vs refuse): decide at design
  time.

Scope notes:

- this is ALSO the component-boundary cleanup for `apps/bookplayer` — isolate
  in-app (subfolders, explicit contracts), extract to `packages/` only when a
  second client exists (decision 2026-07-10).
- write the design first (`thoughts/design/`), plan second.
