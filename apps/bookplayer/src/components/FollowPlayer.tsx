/**
 * Follow player: Bookplayer plays no audio and follows another
 * audiobookshelf client's playback. Owns the follow session and the follow
 * panel, and feeds the shared PlayerView the last tick's audio position for
 * this book. No audio element, no transcript panel, no keyboard control.
 */
import { FollowPanel } from "#/components/FollowPanel";
import { PlayerView } from "#/components/PlayerView";
import { useFollowSession } from "#/lib/follow-session";
import type { BookRow } from "#/server/library";
import type { FollowConfig } from "#/server/follow";

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
        bottomBar={<FollowPanel session={null} tick={null} />}
      />
    );
  }
  return <ConnectedFollowPlayer book={book} url={config.url} />;
}

function ConnectedFollowPlayer({ book, url }: { book: BookRow; url: string }) {
  const session = useFollowSession(url);
  // No interpolation yet: the ebook steps to each tick's audio position.
  const tick =
    session.followed?.bookId === book.id ? session.followed.tick : null;
  return (
    <PlayerView
      book={book}
      audioPosition={tick?.audioPosition ?? null}
      onSeek={noSeek}
      bottomBar={<FollowPanel session={session} tick={tick} />}
    />
  );
}
