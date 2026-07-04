/**
 * Phase 1 framework proof: a raw-Response server route with HTTP Range
 * support on the installed TanStack Start, serving the committed jfk.mp3
 * fixture. Replaced by the real /api asset endpoints in Phase 4.
 */
import { createReadStream, statSync } from "node:fs";
import { resolve } from "node:path";

import { createFileRoute } from "@tanstack/react-router";

// Dev/start run from apps/bookplayer, so the repo root is two levels up.
// Phase 2's lib/config.ts replaces this with proper anchoring.
const FIXTURE = resolve(process.cwd(), "../..", "fixtures/audio/jfk.mp3");

export const Route = createFileRoute("/api/proof")({
  server: {
    handlers: {
      GET: ({ request }) => {
        let stat;
        try {
          stat = statSync(FIXTURE);
        } catch {
          return new Response("Proof fixture not found", { status: 404 });
        }

        const rangeHeader = request.headers.get("range");
        if (!rangeHeader) {
          return new Response(
            createReadStream(FIXTURE) as unknown as ReadableStream,
            {
              status: 200,
              headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": String(stat.size),
                "Accept-Ranges": "bytes",
              },
            },
          );
        }

        const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
        if (!match) {
          return new Response("Invalid Range", {
            status: 416,
            headers: { "Content-Range": `bytes */${stat.size}` },
          });
        }
        const start = Number.parseInt(match[1], 10);
        const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
        if (start >= stat.size || end >= stat.size || start > end) {
          return new Response("Range Not Satisfiable", {
            status: 416,
            headers: { "Content-Range": `bytes */${stat.size}` },
          });
        }

        return new Response(
          createReadStream(FIXTURE, {
            start,
            end,
          }) as unknown as ReadableStream,
          {
            status: 206,
            headers: {
              "Content-Type": "audio/mpeg",
              "Content-Length": String(end - start + 1),
              "Content-Range": `bytes ${start}-${end}/${stat.size}`,
              "Accept-Ranges": "bytes",
            },
          },
        );
      },
    },
  },
});
