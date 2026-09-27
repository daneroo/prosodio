# bookplayer-abs-progress-sync — Socket.IO subscription spike

Status: done

Goal: establish, against a running Audiobookshelf instance, whether Bookplayer
can make a read-only Socket.IO subscription and detect remote playback and an
active-book change before considering integration.

## Boundary

This is an operational probe only. It may add a root-level probe script and its
development dependency, but must not alter Bookplayer's audio transport, UI,
routes, API handlers, or persistence. Tokens and event captures remain untracked
under `.env.local` and `data/abs-probe/` respectively.

## Work

- [x] Record the target ABS URL, server version, test user, and test library
      item privately; use a least-privilege test token where ABS permits it.
- [x] Confirm the documented protocol shape against the target: Socket.IO
      connection, `auth` token event, then `init` or `invalid_token` response.
      (On v2.35.1 the legacy user token received `init`; the new API key was
      valid for REST but emitted `auth_failed` when used directly in `auth`.)
- [x] Add the smallest compatible `socket.io-client` development dependency and
      `scripts/abs-probe.ts`; configuration is environment-only (`ABS_URL`,
      `ABS_TOKEN`) and no secret can reach stdout or a tracked file.
- [x] Make the probe record connection/reconnection, every received event name,
      receive timestamp, and a redacted payload-field inventory under
      `data/abs-probe/`.
- [x] Measure progress-event intervals and identify the item ID, current time,
      playback rate, and play/pause signal—or explicitly record which are
      absent. (Observed `user_item_progress_updated` carries an item ID and
      current time. Rate is not supplied, but is derivable from successive
      current-time/receive-time deltas. No explicit pause field or pause event
      was observed.)
- [x] Update the ticket with redacted, observed facts and an evidence-path
      reference; replace no unknown with a guess.
- [x] Make and record the decision: Socket.IO subscription and active-book
      switching are proven; a separate remote-follow design may proceed, but
      implementation does not yet have a go.

## Acceptance

- [x] A successful authenticated subscription is reproducible from documented
      environment inputs, with no token committed.
- [x] The evidence identifies continuous progress, event cadence, inferred rate,
      active-book switching, and the absence of an explicit pause signal.
- [x] The handoff records actual event names, observed fields, cadence, and a
      bounded viability decision.

## Observed locally — 2026-09-27

- Authenticated subscription is reproducible with `ABS_TOKEN` set to the legacy
  ABS user token; the redacted capture is written to
  `data/abs-probe/socket-*.jsonl`.
- The probe observed a live change from `Money Beyond Borders`
  (`581203c5-…aad1`) to `The Diamond Age` (`4b21157d-…9824f`) while both were
  playing. The transition included `user_session_closed`, then progress for the
  new item. A one-per-item read-only `/api/items/:id` lookup resolved the title
  on change.
- With the local ABS player temporarily set to a 2-second sync threshold and
  playing at 1.5x, current time advanced about 3 seconds every 2 seconds. The
  probe reported 1.5x after each new-item warm-up sample.

## Handoff

Retain `scripts/abs-probe.ts` as a private operational diagnostic through
remote-follow integration and ABS upgrades. The next ticket owns pause/seek/
stop semantics, normal-cadence behavior, production parity, credential custody,
and identity mapping. `bun run ci` was run: formatting, lint, and type checks
passed; two unrelated `rawFileBody` runtime tests currently fail.
