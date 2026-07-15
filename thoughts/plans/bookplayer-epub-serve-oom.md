# Bookplayer EPUB Serve Memory Leak (OOM)

**Status:** Done — accepted in dev and production on 2026-07-15.

## Goal

Document the reproduction, diagnosis, and fix for the
`RangeError: Out of memory` crash that occurs when repeatedly serving large
media assets in the `bookplayer` dev server.

## Final diagnosis

The original OOM had two layers:

- `GET /api/alignment/:bookId` and the non-audio raw asset paths copied whole
  files with `readFileSync` plus `new Uint8Array(bytes)`, retaining a second
  large V8 allocation.
- Raw-file delivery was split across EPUB, cover, VTT, audio, and alignment. The
  first streaming replacement used unsafe Node-to-Web casts. During rapid
  navigation, the dev adapter could continue draining a large selected audio
  range after the browser disconnected. Later diagnostics showed collectible JS
  heap but rising RSS, identifying native allocation churn rather than a
  retained parsed transcript or alignment object.

Production plateaued once whole-file copies and unsafe adapters were removed.
Vite dev did not reliably preserve response cancellation or the incoming
`Request.signal`, so cancellation alone was not a sufficient defensive bound.

## Final implementation

- All raw EPUB, cover, VTT, full/ranged audio, and alignment bodies use the
  centralized `rawFileBody` primitive. It lazily opens the file and performs
  demand-driven 64 KiB positional reads with one cleanup path for EOF, errors,
  stream cancellation, and incoming `Request.signal` aborts.
- The byte stream honors BYOB requests to avoid a backing-buffer allocation when
  the adapter supports them, with a bounded allocate/enqueue fallback when it
  does not.
- Audio `206` responses select at most 1 MiB from broad requested ranges.
  MediaElement follows with subsequent ranges, while abandoned dev-adapter work
  and native allocation churn remain bounded.
- `usePlayerSync` and transcript loading own `AbortController`s, forward their
  signals, and abort stale book requests on route/effect cleanup.
- The deterministic burn-in covers hard and in-app navigation, endpoint
  isolation, request outcomes, fixed seeds/book lists, server RSS, and a
  dev-only `/api/dev/memory` diagnostic for heap/external/array-buffer fields.
  Private-corpus evidence remains under `data/bookplayer/evidence/`.

## Acceptance evidence

Warmed fixed-order repeats plateaued after the final 1 MiB bound:

- dev playback repeat: final five iterations approximately +0.41 MB RSS;
- dev hard-navigation all endpoints: approximately +4.3 MB;
- dev in-app-navigation all endpoints: approximately +0.6 MB;
- production warmed audio repeat: final five approximately +0.64 MB.

No acceptance run reported `ERR_INVALID_CHUNKED_ENCODING`. Dev diagnostics
showed heap usage continuing to oscillate and fall, with negligible retained
array buffers; the remaining small RSS movement is allocator/runtime behavior,
not file-size-proportional retention.

Aggressive epub.js teardown can still emit renderer warnings during rapid
navigation. That is a separate EPUB lifecycle/noise follow-up, not evidence of
this memory leak.

## Review agy-opus-4.6

### Primary fix: correct, but naming is now misleading

The double-buffering OOM diagnosis is solid. `readFileSync` -> `Buffer` ->
`new Uint8Array(bytes)` is a textbook V8 heap copy. The `createReadStream` fix
is the right call.

At review time the function was still called `serveBuffered` and its comment
still described buffering. T6 resolved both by renaming it to `serveFile` and
documenting the shared bounded delivery primitive.

### Secondary leak: the analysis is incomplete

The plan states that "the underlying Nitro/Node HTTP framework fails to properly
destroy the source `createReadStream`." That is a hypothesis, not a confirmed
diagnosis. What was actually observed:

- Fast navigation (abort mid-stream) -> OOM at `internal:webstreams_adapters`
- With playback (slow consumption) -> no crash across 95 books

The crash location (`internal:webstreams_adapters`) tells us the problem is in
the adapter layer that converts a Node readable stream into a Web ReadableStream
-- which is what the `as unknown as ReadableStream` cast forces. When the HTTP
response is aborted, something is not propagating the cancellation signal back
through that adapter to call `.destroy()` on the underlying `fs.ReadStream`.

The break could be in any of:

1. **Bun's adapter** -- Bun implements `internal:webstreams_adapters` itself;
   its cancellation propagation from `Response` -> `ReadableStream` -> Node
   stream may be buggy (a Bun runtime bug).
2. **Nitro/h3** -- the framework may not call `Response.body.cancel()` or
   `abort()` on the underlying stream when the client disconnects (a Nitro bug).
3. **Our cast** -- `createReadStream(path) as unknown as ReadableStream` is a
   lie to the type system. We rely on Bun to auto-convert the Node stream, but
   the conversion may not wire up backpressure/cancellation correctly.

### Ideas for next steps

**Immediate (cheap to try):**

- Convert explicitly via `Readable.toWeb()` instead of casting:

  ```ts
  import { Readable } from "node:stream";
  const nodeStream = createReadStream(path);
  const webStream = Readable.toWeb(nodeStream);
  return new Response(webStream, { ... });
  ```

  `Readable.toWeb()` is the official Node API for this conversion and should
  handle cancellation properly. If Bun supports it, this may fix the secondary
  leak outright.

- Alternatively, use `Bun.file(path)` which returns a `BunFile` (a `Blob`) that
  `Response` natively understands -- no stream adapter at all:
  ```ts
  return new Response(Bun.file(path), { ... });
  ```
  This may be the cleanest path since we are already running on Bun, but it may
  conflict with the `--bun` Nitro/Vite setup.

**Diagnostic (to confirm the root cause):**

- Add `close` / `error` listeners on the `createReadStream` return value and log
  when they fire (or do not). That would confirm whether the stream is being
  destroyed on abort.

## Review codex-gpt-5

### The unsafe adapter is reproducible, and it exists in four response paths

The secondary failure is not blocked on a general E2E harness. A focused local
probe on the repository's Bun 1.3.14 runtime created a 64 MiB file, read the
first response chunk, and then cancelled the response body:

- `new Response(createReadStream(path) as unknown as ReadableStream)` read all
  64 MiB and reached EOF after cancellation.
- `new Response(Readable.toWeb(createReadStream(path)))` stopped after 64 KiB;
  the Node stream was destroyed without reaching EOF.

This supports agy-opus-4.6's adapter diagnosis and directly falsifies the idea
that the current cast is safe. It does not by itself prove every production
disconnect travels through the same path, so a real HTTP abort remains an
acceptance test rather than a prerequisite for trying the fix.

The branch added the unsafe cast to EPUB/cover/VTT serving and alignment, but
the same cast already existed in both full and ranged audio responses. The
burn-in player page can request EPUB, audio, and alignment concurrently, so its
current result cannot identify which endpoint is retaining data. All four
`createReadStream` response sites must be fixed together.

### A second lifecycle leak is client-owned

`usePlayerSync` marks an old alignment request as logically cancelled but does
not create or abort an `AbortController`. During client-side book changes, the
old fetch can keep downloading and parsing an alignment artifact even though its
result will be ignored. Server-side cancellation and client-side request
ownership are separate fixes; both are required.

The current burn-in uses `page.goto`, which causes a full-document navigation.
That is useful for stressing HTTP disconnects, but it does not exercise the
React/TanStack cleanup path used by in-app navigation. It also randomizes books,
starts several asset requests at once, does not sample either process's memory,
and treats “server still alive” as success. It is a reproducer, not yet a leak
regression test.

`net::ERR_INVALID_CHUNKED_ENCODING`, observed repeatedly in the browser, is
consistent with a response body ending early or being framed incorrectly while
one of these streams is aborted. It is supporting evidence, not a root-cause
identification: the application sets `Content-Length`, while the dev-server
adapter may choose or rewrite the actual transfer framing. The regression and
burn-in must record the failed request URL, response headers/status when
available, bytes received, and Playwright's request-failure text so we can tell
which endpoint and framing path emitted it. Dev and production runtimes both
need coverage.

### Consolidation scope

Consolidate the low-level raw-file delivery now, as part of T2, rather than
waiting until cleanup. EPUB, cover, raw VTT, full/ranged audio, and alignment
artifacts should all use one primitive that owns file open, Node-to-Web
conversion, cancellation, and stream-error handling. Their higher-level HTTP
semantics should remain at the call sites: audio owns ranges, alignment owns
ETag/content-encoding, and each asset owns its content/cache headers.

The player transcript strip is different: `fetchTranscript` synchronously reads
and parses VTT, then returns structured cues through a TanStack server function.
It should be audited for request cancellation in T3, but it should not be forced
through the raw-file streaming primitive. A broader redesign of parsed-data
loading is unnecessary unless acceptance still shows retained memory there.

### Other review notes

- The route is `/api/alignment/:bookId`. The original whole-file reads affected
  the alignment artifact and non-audio assets; audio was already streamed and is
  implicated here by its unsafe adapter, not by `readFileSync`.
- The old `serveBuffered` name and buffering policy comment needed
  reconciliation after the implementation switched to bounded delivery.
- `statSync` is caught but the later `createReadStream` open is not. A file that
  disappears or becomes unreadable between those operations no longer follows
  the intended structured-404 path.
- The new no-emoji rules in `docs/coding-style.md` and `docs/styling.md` are not
  part of this memory fix. Keep them only if they were an independently intended
  policy change; otherwise remove them from this branch.
- The generic `e2e-testing-harness` backlog item should not own completion of
  this bug. A narrow abort/leak test belongs to this plan; the reusable harness
  can absorb it later.

## Amended plan

- [x] **T1 — Add a focused cancellation regression.** Use a lower-power coding
      model with medium reasoning. Exercise the same response-body construction
      used by bookplayer with a controllable Node readable, consume one chunk,
      cancel, and assert that the source is destroyed before EOF and stops
      producing bytes. Add deterministic real-HTTP cases for both normal
      completion and mid-response disconnect; capture framing headers and any
      `ERR_INVALID_CHUNKED_ENCODING`-equivalent client failure. Do not wait for
      the general E2E harness. Boundary: test infrastructure and observability
      only, no serving behavior change.
- [x] **T2 — Remove every Node-to-Web cast.** Use a lower-power coding model
      with low-to-medium reasoning after T1. Convert `createReadStream` through
      `Readable.toWeb()` explicitly and centralize raw-file open, conversion,
      cancellation, and error handling in one helper used by EPUB/cover/raw VTT,
      both audio branches, and alignment. Keep range, cache, content-type,
      content-length, encoding, and ETag decisions at their current semantic
      owners. Prefer this smallest change because the local probe already
      demonstrates cancellation; evaluate `Bun.file()`/Blob bodies only if the
      HTTP-level test still fails. Acceptance: no `as unknown as ReadableStream`
      remains in bookplayer, all raw-file routes use the shared primitive, and
      T1 fails on the old implementation/passes on the new one.
- [x] **T3 — Abort client-owned data fetches on route cleanup.** Use a
      lower-power coding model with low-to-medium reasoning; independent of T2.
      Give each enabled `usePlayerSync` effect an `AbortController`, pass its
      signal to `fetchArtifact`, abort on cleanup, and do not surface aborts as
      user errors. Audit `Transcript`/`fetchTranscript` for the equivalent
      cancellation mechanism supported by TanStack server functions and apply it
      if available; otherwise document the framework boundary and prove that
      stale results are promptly released. Extend signal-forwarding tests with
      lifecycle coverage. Boundary: request ownership only; do not redesign
      alignment state or transcript parsing.
- [x] **T4 — Make the burn-in diagnostic and repeatable.** Use a lower-power
      coding model with medium reasoning; may proceed beside T2/T3. Retain hard
      navigation as an HTTP-abort mode and add an in-app navigation mode for
      component cleanup. Add a fixed seed or explicit book list, endpoint
      request/response/failure counts (including failed URL, headers/status when
      available, byte counts, and failure text), `try/finally` browser cleanup,
      and a way to isolate EPUB, audio, raw VTT/transcript, and alignment
      traffic. Record server RSS/heap (by owning the server process or a
      diagnostic channel) at each iteration. Boundary: this remains a
      private-corpus burn-in tool, not the general E2E framework.
- [x] **T5 — Run acceptance as a memory trend, not a survival check.** Use a
      lower-power coding model with medium-to-high reasoning after T2–T4. Run a
      fixed corpus/order in both hard- and in-app-navigation modes, include
      forced mid-response aborts, and save iteration-by-iteration memory plus
      request results under `data/`. Define an allowed warm-up and plateau
      threshold before running; investigate any monotonic retained-memory slope
      rather than accepting a non-crash. Verify production build/runtime as well
      as dev, since adapter stacks may differ.
- [x] **T6 — Reconcile names, scope, and records.** Use a lower-power coding
      model with low reasoning after acceptance. Rename the obsolete helper and
      update media comments, keep or revert the unrelated style-policy edits by
      explicit decision, update the backlog entry to the actual resolved cause,
      and run `bun run ci`. Mark this plan done only after T5 passes; the
      generic E2E ticket may remain open for broader coverage.
