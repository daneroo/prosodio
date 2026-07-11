/**
 * Nitro-native /api/sweep/:bookId handler (plan
 * thoughts/plans/bookplayer-locate-hardening.md, T2.1; decisions H4/H5).
 * GET serves the stored sweep report bytes as-is; PUT validates and persists
 * a fresh one from /lab/locate/:bookId or /lab/locate. Unlike /api/alignment, no
 * library/book lookup is required — the store is keyed by the validated id
 * format only (dev diagnostics; a sweep for an unknown id is harmless).
 *
 * One route entry handles every method: none of this app's nitro.handlers
 * entries set the per-entry `method` filter (see vite.config.ts), so a
 * registered route matches all HTTP methods and the handler itself must
 * branch on event.req.method — mirrored here rather than introducing a new
 * pattern.
 */
import { existsSync, readFileSync } from "node:fs";

import { defineHandler } from "nitro/h3";

import { getConfig } from "#/lib/config";
import { BOOK_ID_RE, jsonError } from "#/lib/media";
import { sweepPath, validateSweepBody, writeSweep } from "#/lib/sweep-store";

// Sweep reports run large on long books (every matched token can carry
// failure detail); this is a generous ceiling against a runaway body, not a
// tuned budget.
const MAX_SWEEP_BODY_BYTES = 32 * 1024 * 1024;

async function serveSweep(bookId: string, request: Request): Promise<Response> {
  if (!BOOK_ID_RE.test(bookId)) {
    return jsonError(400, "INVALID_BOOK_ID", "Book ids are 12 hex chars.");
  }

  const config = getConfig();
  const path = sweepPath(config, bookId);

  if (request.method === "GET") {
    if (!existsSync(path)) {
      return jsonError(
        404,
        "SWEEP_NOT_FOUND",
        "No sweep report stored for this book.",
      );
    }
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch {
      return jsonError(
        404,
        "SWEEP_NOT_FOUND",
        "No sweep report stored for this book.",
      );
    }
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  }

  if (request.method === "PUT") {
    // Reject on the declared size before reading anything...
    const contentLength = request.headers.get("content-length");
    if (
      contentLength !== null &&
      Number(contentLength) > MAX_SWEEP_BODY_BYTES
    ) {
      return jsonError(
        413,
        "SWEEP_TOO_LARGE",
        "Sweep report exceeds the 32 MB limit.",
      );
    }

    const text = await request.text();
    // ...and again on the actual bytes, since Content-Length can be absent
    // or wrong (chunked transfer, misbehaving client).
    if (Buffer.byteLength(text, "utf8") > MAX_SWEEP_BODY_BYTES) {
      return jsonError(
        413,
        "SWEEP_TOO_LARGE",
        "Sweep report exceeds the 32 MB limit.",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return jsonError(400, "SWEEP_INVALID", "Body is not valid JSON.");
    }

    const validated = validateSweepBody(bookId, parsed);
    if (!validated.ok) {
      return jsonError(400, "SWEEP_INVALID", validated.reason);
    }

    writeSweep(path, validated.report);
    return new Response(null, { status: 204 });
  }

  return jsonError(
    405,
    "METHOD_NOT_ALLOWED",
    "Only GET and PUT are supported.",
  );
}

export default defineHandler((event) =>
  serveSweep(event.context.params?.bookId ?? "", event.req),
);
