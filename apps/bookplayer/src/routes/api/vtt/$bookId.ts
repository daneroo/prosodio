import { createFileRoute } from "@tanstack/react-router";

import { serveAsset } from "#/server/assets";

export const Route = createFileRoute("/api/vtt/$bookId")({
  server: {
    handlers: {
      GET: ({ params, request }) => serveAsset("vtt", params.bookId, request),
    },
  },
});
