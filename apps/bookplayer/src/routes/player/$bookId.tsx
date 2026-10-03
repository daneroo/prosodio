import { createFileRoute } from "@tanstack/react-router";

import { LocalPlayer } from "#/components/LocalPlayer";
import { fetchBook } from "#/server/library";

export const Route = createFileRoute("/player/$bookId")({
  loader: ({ params }) => fetchBook({ data: params.bookId }),
  component: PlayerPage,
});

function PlayerPage() {
  const book = Route.useLoaderData();
  return <LocalPlayer book={book} />;
}
