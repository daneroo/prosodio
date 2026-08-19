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

**PUSH, NOT POLL (Daniel, 2026-08-19).** The point of the socket is that ABS
tells us when position changes. Polling is a fallback of last resort, not the
design — if event-driven delivery can be established, drop polling entirely.
Note it buys nothing on granularity anyway: polling every 10-30s is no finer
than a 10-30s tick. A standing poll against a server the user isn't even
listening on is pure waste.

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
- **Token security** — don't ship a token in a public client bundle.

### Subscribe (Socket.io) — the core of this idea

This is the read path the whole feature rests on, so the handover's shape is
kept verbatim rather than summarized. Still unverified.

```js
import { io } from "socket.io-client";

const socket = io("https://your-abs-server.com", {
  auth: { token: "YOUR_ABS_API_TOKEN" },
});

socket.on("connect", () => {
  console.log("Connected to Audiobookshelf socket server");
});
```

Event categories the handover names (not actual event names — it explicitly says
these must be confirmed against the official ABS web client's source or by
watching the network inspector while it runs):

- **progress update / session sync** — broadcast when a client updates its
  playback position. This is the tick that would drive the timeline.
- **stream open / close** — session lifecycle, i.e. when active playback starts
  and stops. Directly relevant to the play/pause problem above: if these are the
  only pause signal, extrapolation has to key off them.

Note the transport assumption baked in here: **Socket.io, not raw WebSocket.**
That implies a client dependency (`socket.io-client`) and a protocol handshake
that must match the server's Socket.io major version. Confirm before adding the
dependency — a version mismatch fails at connect time.

The handover also offers a **polling fallback**: if the socket drops or its
events are too coarse, throttle a REST read instead. Under the read-only
decision that means re-polling `GET /api/me/progress/{libraryItemId}`, not
pushing — and it inherits the same granularity question, since polling every
10-30s is no finer than a 10-30s tick.

The handover also described pushing progress back via
`PATCH /api/me/progress/{libraryItemId}`. **Out of scope** — see the read-only
decision above. Recorded only so nobody re-derives it as a missing piece.

## Step 1 — prove the API with a spike, before any integration

Nothing above is known. The first piece of work is not integration but a
throwaway POC against Daniel's real ABS server with a real token, answering
whether this is possible at all.

**Where.** `scripts/` already holds one-off operational scripts
(`fetch-and-check-fixtures.ts`, `mismatched-corpora.sh`), so a
`scripts/abs-probe.ts` fits the existing convention and keeps the work in-repo
where its findings can be reviewed. Out-of-band is fine too — the deliverable is
the ANSWERS, not the script.

**Token handling.** Read from the environment, never a literal, never committed;
`.env` and `.env.local` are already gitignored (and see
[docs/privacy.md](../../docs/privacy.md)). Any captured output is derived from a
private library — it carries titles and listening habits — so it belongs under
gitignored `data/`, not in the repo.

**Questions it must answer, in priority order:**

1. **Does the socket connect at all** with token auth, and which
   `socket.io-client` major version does the server's handshake require?
2. **What are the real event names?** Log every event the socket emits (a
   catch-all listener) while playing on another device, rather than guessing.
3. **What is the actual tick interval** during continuous playback? This is the
   number the whole idea lives or dies on.
4. **What is in the payload?** Specifically: is playback RATE present, and is
   play/pause state present or only inferable from stream open/close events?
5. **What arrives on a seek**, and can it be told apart from normal drift?
6. **What happens on pause, and on stopping the app entirely** — does the socket
   go quiet, or send a close event?
7. Confirm `GET /api/me/progress/{libraryItemId}` and its field names.
8. **Can Bookplayer's runtime reach the ABS server** at all, and from where —
   server-side or browser?

**Done when** those are written down as observed facts (with a sample event
dump), and the ticket's unverified sections are replaced by what was measured.
That evidence decides whether this becomes a plan or gets closed as not viable.

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
