/**
 * Local player: Bookplayer's own audio. Owns the audio element, keyboard
 * control (via useAudioTransport) and the bottom bar — transcript panel plus
 * audio control panel (PlayerDock) — and feeds the audio position into the
 * shared PlayerView.
 */
import { PlayerDock } from "#/components/PlayerDock";
import { PlayerView } from "#/components/PlayerView";
import { useAudioTransport } from "#/lib/audio-transport";
import type { BookRow } from "#/server/library";

export function LocalPlayer({ book }: { book: BookRow }) {
  const audio = useAudioTransport(book.id);

  return (
    <PlayerView
      book={book}
      audioPosition={audio.currentTime}
      onSeek={audio.seek}
      bottomBar={
        <>
          <audio
            ref={audio.ref}
            src={`/api/audio/${book.id}`}
            preload="metadata"
          />
          <PlayerDock
            bookId={book.id}
            title={book.title}
            author={book.author}
            hasEpub={book.hasEpub}
            hasVtt={book.hasVtt}
            playing={audio.playing}
            currentTime={audio.currentTime}
            duration={audio.duration}
            speed={audio.speed}
            volume={audio.volume}
            audioError={audio.error}
            onTogglePlay={audio.togglePlay}
            onSeek={audio.seek}
            onSkip={audio.skip}
            onCycleSpeed={audio.cycleSpeed}
            onVolume={audio.setVolume}
          />
        </>
      }
    />
  );
}
