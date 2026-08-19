# bookplayer-abs-progress-sync — audiobookshelf as a remote timeline source

UNVERIFIED IDEA (Daniel, 2026-08-19). The ABS specifics below came from a
handover that was never checked against a running audiobookshelf server or its
source. **None of it can be considered accurate yet** — endpoints, payload
fields, event names, tick behaviour. They are a starting point for verification
and may simply be wrong. The IDEA is Daniel's and stands on its own; the API
sketch does not.

## The actual idea

**ABS plays the audiobook independently** — phone, car, headphones — and
Bookplayer plays no audio at all. It subscribes to ABS progress events and uses
the remote position as the CLOCK driving the alignment timeline, so the EPUB
follows along with whatever is being listened to elsewhere.

This is not bookmark sync. It is an **alternative transport**: the remote
position replaces the local `<audio>` element as the time source. Bookplayer
becomes a follow-along reading surface for audio it does not own.

**READ-ONLY, decided (Daniel, 2026-08-19).** Bookplayer consumes ABS events and
never writes back. No PATCH, no progress push, no session creation — ABS remains
the sole owner of listening position. This removes conflict policy, last-writer
races and the risk of corrupting real listening state from the design entirely;
it is not an open question to revisit during implementation.

The existing seam is `useAudioTransport` (`lib/audio-transport.ts`), which today
wraps a hidden `<audio>` and exposes `currentTime`, `seek`, speed, play/pause.
Everything downstream — `sync.activeToken`, reader follow, the alignment panel —
consumes that, not the element. An ABS transport implementing the same shape is
the natural form.

## The critical unknown: tick granularity

Word-level follow needs sub-second position. ABS progress updates are believed
to be periodic and coarse — the handover itself proposes 10-30s throttling for
its own pushes. **If ABS only emits every ~10s, raw ticks are useless for
follow.**

The likely answer is interpolation: take the last tick as an anchor and
extrapolate with a local clock, correcting on each new tick. That needs:

- **playback rate** — extrapolating at 1x while ABS plays at 1.5x drifts 50%.
  Whether the rate is in the event payload at all is unknown.
- **play/pause state** — extrapolating through a pause runs the book away from
  the listener.
- **seek/jump detection** — a large tick delta is a seek, not drift, and must
  snap rather than ease.
- **a drift policy** — how far can extrapolation wander before the reader is
  visibly wrong, and does correction snap or glide?

Measure the real tick interval and payload FIRST. It decides whether this is a
word-level follow, a coarse "you are around here" indicator, or not viable.

## Sketch as handed over (all unverified)

- **Auth** — ABS REST API, or the user API token in the Socket.io handshake
  (`auth: { token }`).
- **Pull initial** — `GET /api/me/progress/{libraryItemId}`, bearer token.
  Claimed fields: `currentTime`, `duration`, `progress` (0..1), `isFinished`,
  `lastUpdate`, `startedAt`, `libraryItemId`, `episodeId`.
- **Subscribe** — Socket.io for playback/session/progress events. **Event names
  unknown**; read them off the official web client or a network inspector.
- **Token security** — don't ship a token in a public client bundle.

The handover also described pushing progress back via
`PATCH /api/me/progress/{libraryItemId}`. **Out of scope** — see the read-only
decision above. Recorded only so nobody re-derives it as a missing piece.

## Also to settle

- **Identity join.** Bookplayer keys by its own `bookId`, ABS by
  `libraryItemId`; nothing maps them today. Relates to `book-metadata-identity`,
  which is open and already contemplates changing what a bookId IS — settle that
  before building a mapping onto a moving target.
- **Reachability and token custody.** Whether Bookplayer's runtime can reach the
  ABS server, and whether the token is held server-side — check
  [docs/privacy.md](../../docs/privacy.md). Read-only access narrows this: a
  token that cannot write is a much smaller thing to hold.
- **Alignment is still required.** This only works for books that HAVE an
  alignment artifact; without one there is no map from audio seconds to a place
  in the EPUB.

## Why it is attractive

The listening library already runs on ABS in production daily
([docs/corpora/validation.md](../../docs/corpora/validation.md)). This would let
Daniel listen on any ABS client and have the book follow, instead of Bookplayer
being a parallel universe with its own private position (`audioPosKey`,
`lib/audio-transport.ts:168`; `cfiKey`, `components/EpubReader.tsx:699`).
