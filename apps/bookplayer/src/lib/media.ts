/**
 * Media serving: id validation, root-confined path resolution, and
 * Response builders with correct range/content-length semantics. Routes are
 * thin shims over these functions so the semantics are unit-testable.
 *
 * Serving policy: small assets (cover, epub, vtt) are buffered so the
 * Content-Length always matches the payload exactly (the codex experiment's
 * ERR_CONTENT_LENGTH_MISMATCH lesson); audio streams, sliced per range.
 */
import {
  createReadStream,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { extname, resolve, sep } from "node:path";

import type { BookplayerConfig } from "./config.ts";
import type { BookRecord } from "./types.ts";

export const BOOK_ID_RE = /^[a-f0-9]{12}$/;

export type AssetKind = "audio" | "cover" | "epub" | "vtt";

/** Structured error payload; no filesystem paths ever leave the server. */
export function jsonError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

/**
 * Resolve a relative path strictly inside a root. Both sides are
 * realpath'ed, and the prefix check is separator-suffixed — "/root-evil"
 * must not pass for root "/root", and a symlink pointing outside the root
 * must not either (the AGY experiment had both holes).
 */
export function safeResolve(rootDir: string, relPath: string): string | null {
  let realRoot: string;
  let realFile: string;
  try {
    realRoot = realpathSync(rootDir);
    realFile = realpathSync(resolve(rootDir, relPath));
  } catch {
    return null;
  }
  if (!realFile.startsWith(realRoot + sep)) return null;
  return realFile;
}

/** Locate a book's asset on disk; null when the capability is absent. */
export function assetPath(
  config: BookplayerConfig,
  book: BookRecord,
  kind: AssetKind,
): string | null {
  const root = config.activeRoot;
  switch (kind) {
    case "audio":
      return safeResolve(root.corporaDir, book.m4bRelPath);
    case "cover":
      return safeResolve(root.corporaDir, book.coverRelPath);
    case "epub":
      return book.epubRelPath
        ? safeResolve(root.corporaDir, book.epubRelPath)
        : null;
    case "vtt":
      return book.hasVtt
        ? safeResolve(root.transcriptionsDir, `${book.basename}.vtt`)
        : null;
  }
}

const MIME_TYPES: Record<string, string> = {
  ".m4b": "audio/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".epub": "application/epub+zip",
  ".vtt": "text/vtt; charset=utf-8",
};

export function mimeType(filePath: string): string {
  return (
    MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}

/** Buffered 200: Content-Length is the actual payload length, always. */
export function serveBuffered(absPath: string): Response {
  const started = performance.now();
  let bytes: Buffer;
  try {
    bytes = readFileSync(absPath);
  } catch {
    return jsonError(404, "ASSET_MISSING", "Asset file is missing.");
  }
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": mimeType(absPath),
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=3600",
      "Server-Timing": timing(started),
    },
  });
}

/** Streamed audio with single-range support (206/416; full 200 otherwise). */
export function serveStreamedWithRange(
  absPath: string,
  request: Request,
): Response {
  const started = performance.now();
  let size: number;
  try {
    size = statSync(absPath).size;
  } catch {
    return jsonError(404, "ASSET_MISSING", "Asset file is missing.");
  }

  const mime = mimeType(absPath);
  const range = parseRangeHeader(request.headers.get("range"), size);

  if (range === "unsatisfiable") {
    return jsonError(416, "RANGE_NOT_SATISFIABLE", "Range not satisfiable.", {
      "Content-Range": `bytes */${size}`,
    });
  }

  if (range === null) {
    return new Response(
      createReadStream(absPath) as unknown as ReadableStream,
      {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
          "Server-Timing": timing(started),
        },
      },
    );
  }

  const { start, end } = range;
  return new Response(
    createReadStream(absPath, { start, end }) as unknown as ReadableStream,
    {
      status: 206,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
        "Server-Timing": timing(started),
      },
    },
  );
}

/**
 * Single-range parser. Returns null for "serve the full file" (no header,
 * non-bytes units, or multi-range — HTTP allows ignoring those), a
 * start/end pair for a satisfiable range, and "unsatisfiable" for ranges
 * that are malformed or outside the file.
 */
export function parseRangeHeader(
  header: string | null,
  size: number,
): { start: number; end: number } | null | "unsatisfiable" {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.startsWith("bytes=")) return null;
  const spec = trimmed.slice("bytes=".length);
  if (spec.includes(",")) return null;

  const match = /^(\d*)-(\d*)$/.exec(spec.trim());
  if (!match) return "unsatisfiable";
  const [, startPart, endPart] = match;

  if (startPart === "" && endPart === "") return "unsatisfiable";

  if (startPart === "") {
    // Suffix range: last N bytes.
    const suffix = Number.parseInt(endPart, 10);
    if (suffix <= 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }

  const start = Number.parseInt(startPart, 10);
  const end = endPart === "" ? size - 1 : Number.parseInt(endPart, 10);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}

function timing(startedMs: number): string {
  return `file;dur=${(performance.now() - startedMs).toFixed(1)}`;
}
