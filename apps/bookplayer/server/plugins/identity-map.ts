/**
 * Starts the follow-mode identity map build in the background at server
 * startup (ADR-0001). It must never delay or fail startup: the build runs
 * after the plugin returns, and its errors are logged by the store.
 */
import { definePlugin } from "nitro";

import { getConfig } from "#/lib/config";
import { getIdentityMap } from "#/lib/identity-map";

export default definePlugin(() => {
  setTimeout(() => {
    try {
      getIdentityMap(getConfig())?.start();
    } catch (error) {
      console.warn(`[identity-map] not started: ${String(error)}`);
    }
  }, 0);
});
