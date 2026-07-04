/**
 * Nitro-native cover handler (registered via nitro.handlers in
 * vite.config.ts). Nitro's dev middleware only dispatches
 * asset-destination requests (Sec-Fetch-Dest: image/audio) to routes in
 * nitro's own routing table, so media-element requests must be served
 * here, not from TanStack server routes. Production bundles both into
 * the same server.
 */
import { defineHandler } from "nitro/h3";

import { serveAsset } from "#/server/assets";

export default defineHandler((event) =>
  serveAsset("cover", event.context.params?.bookId ?? "", event.req),
);
