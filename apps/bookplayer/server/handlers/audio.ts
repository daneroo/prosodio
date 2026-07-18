/** Nitro audio handler using native Bun file slices in every app mode. */
import { defineHandler } from "nitro/h3";

import { serveAsset } from "#/server/assets";

export default defineHandler((event) => {
  return serveAsset("audio", event.context.params?.bookId ?? "", event.req);
});
