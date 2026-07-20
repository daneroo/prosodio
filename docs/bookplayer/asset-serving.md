# Bookplayer asset serving

Goal: a working player with simple asset delivery, exact audio ranges, and no
catastrophic memory growth.

## URLs

- `/api/{audio|epub|cover|vtt|alignment}/:bookId`
  - Audio is M4B and supports exact single byte-range requests.
- `bookId` is twelve lowercase hexadecimal characters. Assets resolve inside the
  configured library root; missing books or assets return structured errors.

## Code ownership

```text
URL -> server/handlers -> src/server/assets.ts -> src/lib/media.ts -> filesystem
```

- `server/handlers` — route-specific behavior.
- `src/server/assets.ts` — book validation and safe path resolution.
- `src/lib/media.ts` — shared file delivery and audio-range semantics.
- Alignment stays in its handler because it generates, caches, and negotiates an
  artifact (cache contract: [../caching.md](../caching.md)).

## Runtime

```text
development -> Vite -> Nitro -> serveAudio -> Bun.file slice
production  -> Nitro         -> serveAudio -> Bun.file slice
```

- Nitro's `self` development runner keeps requests in Vite's Bun process. This
  avoids the worker proxy whose abandoned audio reads caused file-sized RSS
  growth.

## Acceptance

- iPad ad-hoc tests show compatibility with large books, playback, and seeking.
- `apps/bookplayer/scripts/burn-in.ts` uses Playwright for visible end-to-end
  playback across representative books and reports server RSS to expose OOM or
  obvious continuing growth.
