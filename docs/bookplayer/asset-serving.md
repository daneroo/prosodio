# Bookplayer asset serving

The goal is a working player with one understandable path from book ID to file.
Large audio must play without arbitrary range limits or catastrophic memory
growth.

## URLs

- `/api/audio/:bookId` — M4B audio; supports exact single byte-range requests.
- `/api/epub/:bookId` — EPUB.
- `/api/cover/:bookId` — cover image.
- `/api/vtt/:bookId` — raw transcript.
- `/api/alignment/:bookId` — generated alignment JSON, optionally gzip.

`bookId` is twelve lowercase hexadecimal characters. Asset paths are resolved
inside the configured library root; missing books or assets return structured
errors.

## Code ownership

```text
URL
  -> server/handlers/          route-specific HTTP behavior
  -> src/server/assets.ts      book validation and safe asset resolution
  -> src/lib/media.ts          shared file and audio-range semantics
  -> filesystem
```

Alignment has its own handler because it generates, caches, and negotiates an
artifact. Audio owns `Range`, `Content-Range`, `Content-Length`, and
`Accept-Ranges`. Other raw assets use the shared file body.

## Development audio override

Production audio uses the Nitro audio handler and a Bun file body. Development
currently places `server/dev-audio-middleware.ts` before Nitro in
`vite.config.ts`:

```text
development: Vite audio middleware -> shared resolution/range decisions -> file
production:  Nitro audio handler   -> shared resolution/range decisions -> Bun file
```

Only `GET` and `HEAD /api/audio/:bookId` are overridden. Validation, path
resolution, range parsing, status, and headers remain shared. Byte pumping,
backpressure, and disconnect handling are duplicated.

Prior investigation found that the Nitro development proxy did not carry the
browser connection's abort signal to the handler. Abandoned large responses
could continue reading and drive RSS to OOM. The Vite middleware owns the outer
connection and stops bounded reads when it closes.

This split is provisional. It stays only if R2 re-verifies that one shared path
cannot remain bounded through Vite. Otherwise the override and its duplicate
transport code are removed.

## Acceptance

- Brave on iPad plays and seeks the previously failing large book.
- Requested audio ranges are returned exactly, clamped only at EOF.
- `scripts/burn-in.ts` completes representative switching without OOM or an
  obvious continuing or file-size-proportional RSS rise.
- Focused range and disconnect tests pass.

These checks stand in for full end-to-end coverage. Memory tuning targets and
experiment history are not product requirements.
