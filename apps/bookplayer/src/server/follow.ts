/**
 * Follow mode's server surface. The browser connects to audiobookshelf
 * itself (ADR-0001), so it only needs the URL and whether follow mode is
 * configured — never the server's API key — plus the identity map's answer
 * for the item audiobookshelf is playing.
 */
import { createServerFn } from "@tanstack/react-start";

import { getConfig } from "#/lib/config";
import { getIdentityMap } from "#/lib/identity-map";
import type { FollowResolution } from "#/lib/identity-map";

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

function validItemId(itemId: unknown): string {
  if (typeof itemId !== "string" || !itemId || itemId.length > 200) {
    throw new Error("Invalid audiobookshelf item id.");
  }
  return itemId;
}

export const resolveFollowBook = createServerFn({ method: "GET" })
  .validator(validItemId)
  .handler(
    async ({ data: itemId }): Promise<FollowResolution> =>
      (await getIdentityMap(getConfig())?.resolve(itemId)) ?? {
        unknown: true,
      },
  );
