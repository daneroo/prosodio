/**
 * Follow player: Bookplayer plays no audio and follows another
 * audiobookshelf client's playback. Owns the follow session and the follow
 * panel, and feeds the shared PlayerView the remote clock's audio position
 * for this book, refreshed several times a second. No audio element, no
 * transcript panel, no keyboard control.
 */
import { FollowPanel } from "#/components/FollowPanel";
import { PlayerView } from "#/components/PlayerView";
import { readFollowedClock, useFollowSession } from "#/lib/follow-session";
import { useNow } from "#/lib/use-now";
import type { BookRow } from "#/server/library";
import type { FollowConfig } from "#/server/follow";

const REFRESH_MS = 200;

// Nothing to seek: audiobookshelf owns playback and Bookplayer never writes
// progress back.
const noSeek = () => {};

export function FollowPlayer({
  book,
  config,
}: {
  book: BookRow;
  config: FollowConfig;
}) {
  if (!config.configured) {
    return (
      <PlayerView
        book={book}
        audioPosition={null}
        onSeek={noSeek}
        bottomBar={<FollowPanel session={null} reading={null} />}
      />
    );
  }
  return <ConnectedFollowPlayer book={book} url={config.url} />;
}

function ConnectedFollowPlayer({ book, url }: { book: BookRow; url: string }) {
  const session = useFollowSession(url);
  const now = useNow(REFRESH_MS);
  const reading = readFollowedClock(session, book.id, now);
  return (
    <PlayerView
      book={book}
      audioPosition={reading?.audioPosition ?? null}
      onSeek={noSeek}
      bottomBar={<FollowPanel session={session} reading={reading} />}
    />
  );
}
