# bookplayer-abs-remote-follow — preliminary design

Bookplayer offers a second transport mode: ABS plays audio on a phone (or any
other ABS client), while Bookplayer plays no audio and follows the aligned EPUB
from ABS's remote timeline. ABS is the sole position authority; Bookplayer never
writes progress.

## Proven by the Socket.IO spike

- A legacy ABS user token authenticates the Socket.IO `auth` event and receives
  `init`; an API key currently works for REST but not that socket auth path.
- `user_item_progress_updated` provides `libraryItemId` and `currentTime`.
  Stream-time delta divided by local receive-time delta derives playback rate.
- Active-book switching is visible as lifecycle/progress events for a new item.
  A read-only `/api/items/:id` lookup resolves a title once per new item.
- Normal ABS client progress sync is about every 10 seconds after its initial
  sync. There was no explicit pause field or pause event in the observed data.

Evidence and a runnable, redacted operational probe are retained in
[the archived spike plan](../plans/archive/bookplayer-abs-progress-sync.md) and
`scripts/abs-probe.ts`. The implementation task must remove that temporary probe
once the product transport has equivalent integration coverage. It must also
move the spike-only root `socket.io-client` devDependency into the owning
product package, or remove it if the integrated transport does not use it.

## Design entry conditions

- Define an interpolated remote clock with a bounded stale/freeze policy for a
  missed progress tick; it must never keep moving indefinitely through a pause.
- Test pause/resume, forward/backward seek, stop, reconnect, and normal cadence
  without the temporary 2-second client patch.
- Decide browser/server reachability and safe credential custody. Do not ship a
  long-lived ABS token in the public bundle.
- Define the mapping from ABS `libraryItemId` to Bookplayer's book identity,
  including unmatched and duplicate cases.
- Repeat the minimum observation against production ABS before implementation.

This is discovery/design work, not a build plan.
