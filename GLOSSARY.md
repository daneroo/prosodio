# Prosodio

Prosodio manages, aligns and plays audiobooks alongside their ebooks on a
synchronized timeline. Bookplayer is the app that plays them.

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
