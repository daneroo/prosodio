/**
 * Nitro-native /api/alignment/:bookId handler (plan
 * thoughts/plans/bookplayer-align-refine-model.md, T3.2). Serves the
 * AlignmentArtifact v2 as pure bytes: computes/loads via the T3.1 cache
 * (src/lib/artifact-cache.ts), then applies the ETag/Accept-Encoding
 * decisions from src/lib/artifact-http.ts. First-compute latency (minutes on
 * big private books) intentionally holds the request open — same UX as the
 * old fetchAlignment path.
 */
import { createReadStream, existsSync, statSync } from "node:fs";

import { defineHandler } from "nitro/h3";

import { loadOrComputeArtifact } from "#/lib/artifact-cache";
import { artifactEtag, isNotModified, pickEncoding } from "#/lib/artifact-http";
import { getConfig } from "#/lib/config";
import { getLibrary } from "#/lib/library";
import { BOOK_ID_RE, assetPath, jsonError } from "#/lib/media";

async function serveAlignment(
  bookId: string,
  request: Request,
): Promise<Response> {
  if (!BOOK_ID_RE.test(bookId)) {
    return jsonError(400, "INVALID_BOOK_ID", "Book ids are 12 hex chars.");
  }

  const config = getConfig();
  const library = getLibrary(config);
  library.getIndex();
  const book = library.getBook(bookId);
  if (!book) {
    return jsonError(404, "BOOK_NOT_FOUND", "No book with this id.");
  }

  const hasVtt = assetPath(config, book, "vtt") !== null;
  const hasEpub = assetPath(config, book, "epub") !== null;
  if (!hasVtt || !hasEpub) {
    return jsonError(
      404,
      "ASSET_UNAVAILABLE",
      "This book has no alignment (needs both EPUB and transcript).",
    );
  }

  const entry = await loadOrComputeArtifact(config, book);
  if (!entry) {
    return jsonError(
      404,
      "ASSET_UNAVAILABLE",
      "This book has no alignment (needs both EPUB and transcript).",
    );
  }

  const etag = artifactEtag(entry.key);
  if (isNotModified(request.headers.get("if-none-match"), etag)) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "no-cache" },
    });
  }

  const encoding = pickEncoding(
    request.headers.get("accept-encoding"),
    existsSync(entry.paths.gz),
  );
  const path = encoding === "gzip" ? entry.paths.gz : entry.paths.json;

  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return jsonError(404, "ASSET_MISSING", "Artifact file is missing.");
  }

  return new Response(createReadStream(path) as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(size),
      ETag: etag,
      "Cache-Control": "no-cache",
      ...(encoding === "gzip" ? { "Content-Encoding": "gzip" } : {}),
    },
  });
}

export default defineHandler((event) =>
  serveAlignment(event.context.params?.bookId ?? "", event.req),
);
