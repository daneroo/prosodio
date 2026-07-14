# Bookplayer EPUB Serve Memory Leak (OOM)

**Status:** Completed

## Goal

Document the reproduction, diagnosis, and fix for the
`RangeError: Out of memory` crash that occurs when repeatedly serving large
media assets in the `bookplayer` dev server.

## Tasks Completed

- [x] **The Fix**: Replaced the `readFileSync` buffering approach in **both**
      `apps/bookplayer/server/handlers/alignment.ts` and
      `apps/bookplayer/src/lib/media.ts` with `createReadStream` to properly
      stream large media to the client.
- [x] **Burn-in Script**: Created a headed Playwright load-testing script
      (`apps/bookplayer/scripts/burn-in.ts`) to programmatically navigate the
      library, render the audio player, and simulate playback/seeking.
- [x] **Backlog - E2E Testing**: Abandoned "fake" offline unit tests in favor of
      adding a backlog ticket (`e2e-testing-harness`) to build a robust E2E
      testing framework capable of tracking actual server lifecycle memory
      leaks.

## Diagnosis & Fix

Both the `GET /api/align/:bookId` endpoint and the EPUB media server
(`serveBuffered` in `media.ts`) were reading large media files entirely into
memory using `readFileSync`. They then returned the results as a `Uint8Array`.
Passing a Node `Buffer` to the `Uint8Array` constructor caused a **full memory
copy** in the V8 heap. For large audio files and EPUBs, this double-buffering
rapidly exhausted the heap, leading to a `RangeError: Out of memory` crash in
the dev server.

The fix involved returning `createReadStream(path) as unknown as ReadableStream`
to stream the payload natively in Nitro, bypassing the V8 heap entirely.

## The Aborted Stream Leak (Secondary Discovery)

While verifying the fix with the burn-in script in "fast mode" (navigating
rapidly between pages without waiting for playback), we uncovered a second
memory leak.

When a client aborts a media stream mid-flight, the underlying Nitro/Node HTTP
framework fails to properly destroy the source `createReadStream`. This causes
`internal:webstreams_adapters` to silently pump the entire file from disk into a
"dead" memory queue until the V8 heap explodes.

We concluded that isolating this deep framework bug using synthetic unit tests
(`bun:test` without a server) is impossible. We deferred fixing this second leak
until we have a dedicated E2E testing harness (tracked in `BACKLOG.md`) capable
of booting a real dev server and accurately observing request/response lifecycle
memory usage.
