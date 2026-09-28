# audio-stts-timeline-audit — m4b sample tables that lie about duration

why: _The Diamond Age_ (2012 m4b) stayed in sync when played straight through
but drifted permanently after any seek past 0:48:29 (diagnosed 2026-09-27). Not
a Bookplayer bug. The file is ~23 joined source parts; at each join the next
part's first ~13 s of AAC packets are marked 1 sample long in `stts` instead
of 1024. 23 joins lose ~300 s from the declared timeline in total.

- play-through: the decoder plays every packet, so the audio is complete and
  matches the Whisper VTT (also made from decoded samples).
- seek: the player converts time -> packet via `stts`, so it lands ~13 s late
  per join crossed. The clock restarts from that wrong anchor and the offset
  never goes away.
- a plain remux (`-c copy`) does not fix it (it copies the broken table); see
  option (c). Diamond Age was fixed by replacing the file
  (`Staging/...Bug-Update/The Diamond Age-GoodNew.m4b`, 22 isolated 1-sample
  packets ≈ 0.5 s, harmless). The VTT and alignment must be regenerated.

detect: `ffprobe -show_entries stream=nb_frames,sample_rate,duration`; flag when
`nb_frames × 1024 / sample_rate − duration` exceeds ~1 s (Diamond Age: ~300 s).
Cheap, since it reads only the header. For more detail, histogram the packet
durations (`-show_entries packet=duration`) and look for runs of `dur=1`, but
that reads the whole file (~minutes per book).

options: (a) one-off script over the audiobooks root; (b) a validate-cli rule on
the existing ffprobe pass (`packages/corpus`), severity error, so staging
catches it before a book lands; (c) sanitize losslessly: every AAC-LC frame
decodes to 1024 samples, so rebuild the timestamps without re-encoding:
`ffmpeg -i in.m4b -map 0 -c copy -bsf:a "setts=ts=N*1024:duration=1024" out.m4b`.
Untried. Check that chapters were authored against the broken or the real
timeline (shift them or rebuild from the VTT), that tags and cover survive, and
that declared duration equals decoded samples. A candidate repair step for
`validate-fix-apply`. Fallback: a full re-encode (slow, lossy).

scan 2026-09-28 (header check, 979 m4bs in `Reading/audiobooks`, 21 s): 932
exact at 1024 and 17 at 2048. ~23 books match the Diamond Age pattern (+40 to
+430 s: Kafka on the Shore, Steve Jobs, Malice, several Reynolds/Nesbø). 4 have
odd frame sizes (Tigana, An Army at Dawn, Winning the Loser's Game, Death
Masks). A few over-count (−40 to −110 s: Canterbury Tales, Countdown to Zero
Day). ~130 are within ±20 s, probably noise. The odd and over-counting books may
have a different cause, so `N*1024` is not assumed safe for them.

revisit-when: next corpus validation pass, or another seek-only drift report.
