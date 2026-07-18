/** Coarse process RSS telemetry for the private-corpus burn-in script. */
import { defineHandler } from "nitro/h3";

export function serveMemoryUsage(): Response {
  const { rss } = process.memoryUsage();
  return Response.json(
    { rssBytes: rss },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export default defineHandler(() => serveMemoryUsage());
