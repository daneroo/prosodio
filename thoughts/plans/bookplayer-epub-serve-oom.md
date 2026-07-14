# Bookplayer EPUB Serve Memory Leak (OOM)

**Status:** Active

## Tasks

- [x] **The Fix**: Apply the fix in `apps/bookplayer/src/lib/media.ts` (replace
      double-buffering approach with `createReadStream` while preserving
      `Content-Length`).
- [x] **Add the Repro Script**: Add the headed Playwright script in
      `apps/bookplayer/scripts/burn-in.ts` so it can be re-run in the future. It
      tests if the server is running and also triggers audio playback.
- [x] **Add an Automated Test**: Add a `bun test` integration test directly in
      `apps/bookplayer/src/lib/media.test.ts` that loops `serveBuffered` on a
      5MB file 50 times to catch the leak without needing the HTTP server.
- [x] **Update Backlog**: Add an item to `BACKLOG.md` to decide on the e2e
      testing harness and statute on the Playwright question.

## Goal

Document the reproduction, diagnosis, and fix for the
`RangeError: Out of memory` crash that occurs when repeatedly serving EPUB
assets in the `bookplayer` dev server.

## Reproduction Script

The problem required repeatedly navigating between books to reproduce. We will
add a durable burn-in script (`apps/bookplayer/scripts/burn-in.ts`) that uses
Playwright (headed, to allow co-observation of the UI and server logs) to
automatically navigate through the library and trigger the issue.

- **Dependency Note**: The `playwright` devDependency was added to
  `apps/bookplayer/package.json`. It is a known policy/fact that we wanted to
  avoid Playwright as a dependency (even dev) in the `bookplayer` app, but we
  are keeping it for now so the repro script continues to function. A new
  `BACKLOG.md` item (`e2e-testing-harness`) has been added to formally decide
  how we handle E2E testing and statute on the Playwright question globally.

## Diagnosis

The `serveBuffered` function in `src/lib/media.ts` was designed to buffer assets
completely in memory to avoid `ERR_CONTENT_LENGTH_MISMATCH` by guaranteeing the
`Content-Length` matched the payload exactly. However, it read the file via
`readFileSync` (yielding a `Buffer`) and then passed it to
`new Uint8Array(bytes)`. In Node/Bun, a `Buffer` is already a `Uint8Array`.
Passing it to the `Uint8Array` constructor creates a **full copy** of the
underlying memory buffer in the V8 heap. For large EPUBs (10-20MB), this
double-buffering combined with V8's garbage collection lag quickly exhausted the
heap, leading to `RangeError: Out of memory at allocUnsafeSlow (native:1:1)` and
crashing the Nitro/Vite dev server.
