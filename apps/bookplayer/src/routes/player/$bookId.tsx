import { createFileRoute } from "@tanstack/react-router";

import { FollowPlayer } from "#/components/FollowPlayer";
import { LocalPlayer } from "#/components/LocalPlayer";
import { fetchFollowConfig } from "#/server/follow";
import { fetchBook } from "#/server/library";

interface PlayerSearch {
  /** Present: follow audiobookshelf's playback instead of playing audio. */
  follow?: "audiobookshelf";
}

export const Route = createFileRoute("/player/$bookId")({
  validateSearch: (search: Record<string, unknown>): PlayerSearch =>
    search.follow === "audiobookshelf" ? { follow: "audiobookshelf" } : {},
  loaderDeps: ({ search }) => ({ follow: search.follow }),
  loader: async ({ params, deps }) => ({
    book: await fetchBook({ data: params.bookId }),
    followConfig: deps.follow ? await fetchFollowConfig() : null,
  }),
  component: PlayerPage,
});

function PlayerPage() {
  const { book, followConfig } = Route.useLoaderData();
  return followConfig ? (
    <FollowPlayer book={book} config={followConfig} />
  ) : (
    <LocalPlayer book={book} />
  );
}
