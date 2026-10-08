# Prosodio

Prosodio manages, aligns and plays audiobooks alongside their ebooks on a
synchronized timeline. Bookplayer is the app that plays them; to its users it
presents itself as Prosodio.

## Positions

**Audio position**: Seconds into the audiobook. It comes from Bookplayer's own
audio or, in follow mode, from the remote clock.\
_Avoid_: playhead, book position, book time, current time

**Ebook position**: A place in the EPUB, down to the word the alignment maps the
audio position to.\
_Avoid_: reading position, book position, location

**Rate**: Audio seconds per real (wall-clock) second; the listener's playback
speed.\
_Avoid_: speed multiplier, pace

**Link**: The state in which the ebook panel keeps the ebook position on the
active word as the audio position moves. Navigating the ebook by hand unlinks
it.\
_Avoid_: follow, reader follow, tracking

## Follow mode

**Follow mode**: Bookplayer plays no audio and follows another audiobookshelf
client's playback, keeping the ebook position on what that client is playing.\
_Avoid_: remote mode, sync mode, remote follow

**Tick**: In follow mode, one progress report from audiobookshelf: which item is
playing and its audio position, stamped with when it was received.\
_Avoid_: heartbeat, progress update, sync

**Remote clock**: In follow mode, the estimate of the other client's current
audio position, interpolated from the last tick at the observed rate.\
_Avoid_: remote player, interpolator

**Freeze**: An inferred pause: the remote clock holds still because an expected
tick has not arrived in time. A pause is never observed directly.\
_Avoid_: pause (for the clock state), stall

**Offset**: A constant lead, in real seconds, added on top of the remote clock
and set per device. It covers network latency plus the lead that reads best.\
_Avoid_: delay, latency, lag

## Bookplayer UI

**Top bar**: The strip across the top of the player: navigation, book identity,
and toggles.

**Ebook panel**: The EPUB view, including its toolbar and search.\
_Avoid_: reader pane, reader band

**Alignment panel**: The transcript cues annotated with how each word matched
the ebook.

**Transcript panel**: The plain, unaligned transcript cues.\
_Avoid_: transcript strip

**Bottom bar**: The strip across the bottom of the player. It holds the
transcript panel and the audio control panel, or in follow mode only the follow
panel.\
_Avoid_: dock

**Audio control panel**: Play, seek, skip, speed and volume for Bookplayer's own
audio.\
_Avoid_: transport

**Follow panel**: Follow mode's replacement for the audio control panel:
connection, remote clock state, and the offset control.\
_Avoid_: follow bar

## Logo

One design effort in three sizes, each its own thing: logo (SM), staff logo
(MD), hero logo (Hero). The logo is used in three forms: bare, on a tile, or in
the lockup. A tile and a lockup each contain the logo; neither is the logo.

**Logo**: Prosodio's symbol: a pilcrow with sound waves radiating from it —
prose and the voice reading it. Bare, it has no background and takes the color
of the page it sits on.\
_Avoid_: mark, icon, glyph

**Tile**: The logo on its own opaque square background, in the logo's own
colors, for places with no page behind it (favicon, Home Screen icon).\
_Avoid_: app icon, badge

**Lockup**: The logo with the name "Prosodio" beside it, in the logo's own font
and colors; the app's identity in its header. It holds the logo, never a tile.\
_Avoid_: brand, wordmark, logo with title

**Small variant**: The simplified logo, with fewer and heavier sound waves,
drawn wherever the logo is small: bare, on a tile, or in the lockup.

**Tile scheme**: A tile's logo color on its background, read as "‹logo› on
‹background›".

**Finish**: How a tile's background is lit: flat, sheen or glass.

**Staff logo**: The pilcrow as clef at the head of a musical staff, with letters
and notes on the lines; for medium and large sizes.

**Hero logo**: The pilcrow as clef at the head of a ruled page, with a famous
book's opening lines written on the staff; a page-scale illustration.
