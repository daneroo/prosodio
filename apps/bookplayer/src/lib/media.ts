/**
 * Media serving: id validation, root-confined path resolution, and
 * Response builders with correct range/content-length semantics. Routes are
 * thin shims over these functions so the semantics are unit-testable.
 *
 * Serving policy: non-audio raw assets use a bounded, demand-driven file body
 * with centralized disconnect cleanup. Audio uses native Bun file slices in
 * development and production. Content-Length always describes the selected
 * file or range exactly.
 */
import { realpathSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

import type { FileHandle } from "node:fs/promises";

import type { BookplayerConfig } from "./config.ts";
import type { BookRecord } from "./types.ts";

export const BOOK_ID_RE = /^[a-f0-9]{12}$/;

const RAW_FILE_CHUNK_BYTES = 64 * 1024;

export type AssetKind = "audio" | "cover" | "epub" | "vtt";
export type ByteRange = { start: number; end: number };

export type AudioResponseDescriptor = {
  status: 200 | 206;
  headers: Record<string, string>;
  fileSize: number;
  mime: string;
  range?: ByteRange;
};

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

/**
 * Open a raw file as a bounded, demand-driven Response body. Each pull reads at
 * most one fixed-size chunk and the common close path releases the file handle
 * on EOF, range completion, cancellation, or error. File open errors remain
 * asynchronous and surface when the body is consumed.
 */
export function rawFileBody(
  absPath: string,
  range?: { start: number; end: number },
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  let position = range?.start ?? 0;
  const endExclusive = range ? range.end + 1 : undefined;
  let handle: FileHandle | undefined;
  let handlePromise: Promise<FileHandle> | undefined;
  let closed = false;
  let cancelled = false;
  let aborted = false;
  let streamController: { close: () => void } | undefined;

  const onAbort = (): void => {
    if (aborted) return;
    aborted = true;
    cancelled = true;
    streamController?.close();
    void closeHandle();
  };

  const detachAbortListener = (): void => {
    signal?.removeEventListener("abort", onAbort);
  };

  const getHandle = async (): Promise<FileHandle> => {
    handlePromise ??= open(absPath, "r");
    handle ??= await handlePromise;
    return handle;
  };

  const closeHandle = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    detachAbortListener();

    const opened = handle ?? (await handlePromise?.catch(() => undefined));
    await opened?.close().catch(() => undefined);
  };

  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });

  return new ReadableStream<Uint8Array>(
    {
      type: "bytes",
      start(controller): void {
        streamController = controller;
        if (aborted) controller.close();
      },
      async pull(controller): Promise<void> {
        try {
          const remaining =
            endExclusive === undefined
              ? RAW_FILE_CHUNK_BYTES
              : endExclusive - position;
          if (remaining <= 0) {
            controller.close();
            await closeHandle();
            return;
          }

          const file = await getHandle();
          if (cancelled) {
            await closeHandle();
            return;
          }

          const byteController =
            "byobRequest" in controller ? controller : undefined;
          const byobRequest = byteController?.byobRequest;
          const byobView = byobRequest?.view;
          const readLength = Math.min(
            RAW_FILE_CHUNK_BYTES,
            remaining,
            byobView?.byteLength ?? Number.POSITIVE_INFINITY,
          );
          const buffer: Uint8Array<ArrayBuffer> =
            byobView instanceof Uint8Array && byobView.byteLength === readLength
              ? (byobView as Uint8Array<ArrayBuffer>)
              : byobView
                ? new Uint8Array(
                    byobView.buffer,
                    byobView.byteOffset,
                    readLength,
                  )
                : new Uint8Array(readLength);
          const { bytesRead } = await file.read(
            buffer,
            0,
            buffer.byteLength,
            position,
          );
          if (bytesRead === 0) {
            controller.close();
            byobRequest?.respond(0);
            await closeHandle();
            return;
          }

          position += bytesRead;
          if (byobRequest) {
            byobRequest.respond(bytesRead);
          } else {
            controller.enqueue(
              bytesRead === buffer.byteLength
                ? buffer
                : buffer.subarray(0, bytesRead),
            );
          }

          if (endExclusive !== undefined && position >= endExclusive) {
            controller.close();
            await closeHandle();
          }
        } catch (error) {
          await closeHandle();
          if (!cancelled) controller.error(error);
        }
      },
      async cancel(): Promise<void> {
        cancelled = true;
        await closeHandle();
      },
    },
    { highWaterMark: 0 },
  );
}

/** Shared bounded raw-file 200; Content-Length is the exact payload length. */
export function serveFile(absPath: string, signal?: AbortSignal): Response {
  const started = performance.now();
  let size: number;
  try {
    size = statSync(absPath).size;
  } catch {
    return jsonError(404, "ASSET_MISSING", "Asset file is missing.");
  }
  return new Response(rawFileBody(absPath, undefined, signal), {
    status: 200,
    headers: {
      "Content-Type": mimeType(absPath),
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=3600",
      "Server-Timing": timing(started),
    },
  });
}

/** Native Bun audio response with single-range support. */
export function serveAudio(absPath: string, request: Request): Response {
  const descriptor = describeAudioResponse(
    absPath,
    request.headers.get("range"),
  );
  if (descriptor instanceof Response) return descriptor;

  const { fileSize, mime, range } = descriptor;
  const file = Bun.file(absPath);
  const body = range
    ? file.slice(range.start, range.end + 1, mime)
    : file.slice(0, fileSize, mime);
  return new Response(body, {
    status: descriptor.status,
    headers: descriptor.headers,
  });
}

/**
 * Describe one audio response without constructing its native file body so
 * protocol decisions remain independently testable.
 */
export function describeAudioResponse(
  absPath: string,
  rangeHeader: string | null,
): AudioResponseDescriptor | Response {
  const started = performance.now();
  let size: number;
  try {
    size = statSync(absPath).size;
  } catch {
    return jsonError(404, "ASSET_MISSING", "Asset file is missing.");
  }

  const mime = mimeType(absPath);
  const range = parseRangeHeader(rangeHeader, size);

  if (range === "unsatisfiable") {
    return jsonError(416, "RANGE_NOT_SATISFIABLE", "Range not satisfiable.", {
      "Content-Range": `bytes */${size}`,
    });
  }

  const commonHeaders = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
    "Server-Timing": timing(started),
  };

  if (range === null) {
    return {
      status: 200,
      headers: { ...commonHeaders, "Content-Length": String(size) },
      fileSize: size,
      mime,
    };
  }

  const { start, end } = range;
  return {
    status: 206,
    headers: {
      ...commonHeaders,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
    },
    fileSize: size,
    mime,
    range,
  };
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
): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.startsWith("bytes=")) return null;
  const spec = trimmed.slice("bytes=".length);
  if (spec.includes(",")) return null;

  const match = /^(\d*)-(\d*)$/.exec(spec.trim());
  if (!match) return "unsatisfiable";
  const [, startPart = "", endPart = ""] = match;

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
