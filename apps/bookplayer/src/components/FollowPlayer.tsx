/**
 * Follow player: Bookplayer plays no audio and follows another
 * audiobookshelf client's playback. Owns the follow session and the follow
 * panel, and feeds the shared PlayerView the remote clock's audio position
 * for this book, refreshed several times a second. No audio element, no
 * transcript panel, no keyboard control.
 *
 * Book switch: when audiobookshelf moves to an item that resolves to another
 * book, navigate there, still following (the session keeps the offset and
 * rate). An unmatched item leaves this book in place with a notice.
 */
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { FollowPanel } from "#/components/FollowPanel";
import { PlayerView } from "#/components/PlayerView";
import { readFollowedPosition, useFollowSession } from "#/lib/follow-session";
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
        bottomBar={<FollowPanel bookId={book.id} session={null} />}
      />
    );
  }
  return <ConnectedFollowPlayer book={book} url={config.url} />;
}

function ConnectedFollowPlayer({ book, url }: { book: BookRow; url: string }) {
  const session = useFollowSession(url);
  const now = useNow(REFRESH_MS);
  const reading = readFollowedPosition(session, book.id, now);

  const navigate = useNavigate();
  const followedBookId = session.followed?.bookId;
  useEffect(() => {
    if (!followedBookId || followedBookId === book.id) return;
    // Replace, so Back doesn't land on a follow view that would switch
    // straight back here.
    void navigate({
      to: "/player/$bookId",
      params: { bookId: followedBookId },
      search: { follow: "audiobookshelf" },
      replace: true,
    });
  }, [followedBookId, book.id, navigate]);

  return (
    <PlayerView
      book={book}
      audioPosition={reading?.audioPosition ?? null}
      onSeek={noSeek}
      bottomBar={
        <FollowPanel bookId={book.id} session={session} reading={reading} />
      }
    />
  );
}
