# lab-routes — rename /dev to /lab, reserve the surface map

why: `/dev` says nothing, and "sweep" is too generic — the sweep VERIFIES
locate; locate (an epub.js runtime quality) is the thing under test. Decision
2026-07-10: inspection/debug surfaces stay in the bookplayer app ("status
quo+"), co-located with the data plane they read; a separate workbench app only
if the data plane is ever extracted for a second client.

Route map — uniform shape, corpus summary + per-book detail:

| surface                           | summary        | detail                 |
| --------------------------------- | -------------- | ---------------------- |
| locate (epub.js runtime, browser) | `/lab/locate`  | `/lab/locate/$bookId`  |
| alignment (match quality)         | `/lab/align`   | `/lab/align/$bookId`   |
| epub conformance                  | `/lab/epub`    | `/lab/epub/$bookId`    |
| parser equivalence/swapability    | `/lab/parsers` | `/lab/parsers/$bookId` |

- only locate exists today: `dev.sweep.tsx` -> `lab.locate.tsx` (summary),
  `dev.locate.$bookId.tsx` -> `lab.locate.$bookId.tsx`. The other rows are
  reserved names, not commitments.
- optional `/lab` index: cheap dashboard linking the surfaces.
- rename touches `docs/LOCATE-SWEEP.md`, `apps/bookplayer/README.md`, the player
  dev link; decide then whether `/api/sweep` follows (e.g. `/api/locate-sweep`).
- locate requires a real browser runtime; consider a Web Worker for
  off-main-thread sweeps later (out of scope for the rename).
