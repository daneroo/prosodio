/**
 * Follow mode's server surface. The browser connects to audiobookshelf
 * itself (ADR-0001), so it only needs the URL and whether follow mode is
 * configured — never the server's API key.
 */
import { createServerFn } from "@tanstack/react-start";

import { getConfig } from "#/lib/config";

export type FollowConfig =
  { configured: true; url: string } | { configured: false };

export const fetchFollowConfig = createServerFn({ method: "GET" }).handler(
  (): FollowConfig => {
    const audiobookshelf = getConfig().audiobookshelf;
    return audiobookshelf
      ? { configured: true, url: audiobookshelf.url }
      : { configured: false };
  },
);
