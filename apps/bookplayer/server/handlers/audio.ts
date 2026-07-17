/**
 * Nitro audio handler registered for the built server. Development requests
 * are intercepted earlier by the direct Vite middleware. The event runtime
 * selects native Bun file slices in production and retains the bounded stream
 * as the non-Bun fallback.
 */
import { defineHandler } from "nitro/h3";

import { serveAsset } from "#/server/assets";

export default defineHandler((event) => {
  const audioBodyStrategy =
    event.runtime?.name === "bun" ? "bun-file" : "bounded-stream";
  return serveAsset("audio", event.context.params?.bookId ?? "", event.req, {
    audioBodyStrategy,
  });
});
