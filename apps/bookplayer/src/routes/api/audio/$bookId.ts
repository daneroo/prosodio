import { createFileRoute } from "@tanstack/react-router";

import { serveAsset } from "#/server/assets";

export const Route = createFileRoute("/api/audio/$bookId")({
  server: {
    handlers: {
      GET: ({ params, request }) => serveAsset("audio", params.bookId, request),
    },
  },
});
