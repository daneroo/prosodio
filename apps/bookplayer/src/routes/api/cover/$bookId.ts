import { createFileRoute } from "@tanstack/react-router";

import { serveAsset } from "#/server/assets";

export const Route = createFileRoute("/api/cover/$bookId")({
  server: {
    handlers: {
      GET: ({ params, request }) => serveAsset("cover", params.bookId, request),
    },
  },
});
