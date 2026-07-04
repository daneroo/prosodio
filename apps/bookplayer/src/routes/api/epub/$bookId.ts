import { createFileRoute } from "@tanstack/react-router";

import { serveAsset } from "#/server/assets";

export const Route = createFileRoute("/api/epub/$bookId")({
  server: {
    handlers: {
      GET: ({ params, request }) => serveAsset("epub", params.bookId, request),
    },
  },
});
