/** Dev-only process memory telemetry for the private-corpus burn-in script. */
import { defineHandler } from "nitro/h3";

export function serveMemoryUsage(isDev = import.meta.env.DEV): Response {
  if (!isDev) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { rss, heapUsed, heapTotal, external, arrayBuffers } =
    process.memoryUsage();
  return Response.json(
    {
      rssBytes: rss,
      heapUsedBytes: heapUsed,
      heapTotalBytes: heapTotal,
      externalBytes: external,
      arrayBuffersBytes: arrayBuffers,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export default defineHandler(() => serveMemoryUsage());
