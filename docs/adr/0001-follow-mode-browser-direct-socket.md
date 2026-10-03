# Follow mode: the browser subscribes to audiobookshelf directly

Follow mode's browser opens the Socket.IO connection to audiobookshelf itself,
authenticated with an API key pasted once and stored on each device. The
Bookplayer server does not relay ticks. It holds its own audiobookshelf URL and
API key only to build the identity map (audiobookshelf item → Bookplayer book)
at startup. We chose this because the socket was measured open to any origin,
which makes a relay pure overhead, while the REST API was not. See #10.

## Considered Options

- **Server relay** (Socket.IO on the server, SSE to the browser), the original
  proposal in #10: keeps the key off devices, but adds a long-lived server
  connection and a second transport for no functional gain.
- **Identity lookup in the browser**: audiobookshelf's REST preflight
  (`OPTIONS /api/…` with `Authorization`) is refused cross-origin. Its
  `Allowed CORS Origins` server setting could open it, but the server-side map
  needs no CORS change, and it keeps filesystem paths off the client.

## Consequences

- Measured on production audiobookshelf 2.37.1 (2026-10-02), both direct and
  through Caddy: Socket.IO polling and WebSocket handshakes allow origin `*`; an
  API key authenticates the socket `auth` event. If a later audiobookshelf
  version closes either, follow mode needs the relay after all.
- The identity map matches an audiobookshelf item's `relPath` to a Bookplayer
  book's directory. It relies on audiobookshelf and Bookplayer's private library
  reading the same directory tree, one book per directory.
