/**
 * Nitro-native GET /api/locate-sweep handler (plan
 * thoughts/plans/bookplayer-locate-hardening.md, T2.1): a totals-only
 * index of every stored sweep report, for the /lab/locate corpus page.
 * Registered as its own route (not folded into locate-sweep.ts's :bookId route) so
 * "the whole corpus" and "one book" stay two separate, obviously-scoped
 * handlers.
 */
import { defineHandler } from "nitro/h3";

import { getConfig } from "#/lib/config";
import { jsonError } from "#/lib/media";
import { sweepIndex } from "#/lib/locate-sweep-store";

function serveSweepIndex(request: Request): Response {
  if (request.method !== "GET") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "Only GET is supported.");
  }
  return Response.json(sweepIndex(getConfig()));
}

export default defineHandler((event) => serveSweepIndex(event.req));
