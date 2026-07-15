/**
 * Shared handler behind the four /api/<kind>/$bookId routes: validate the
 * id, resolve the book and asset inside the active root, serve with the
 * right semantics (audio streams with ranges; the rest are buffered).
 */
import { getConfig } from "#/lib/config";
import { getLibrary } from "#/lib/library";
import {
  BOOK_ID_RE,
  assetPath,
  jsonError,
  serveBuffered,
  serveStreamedWithRange,
} from "#/lib/media";
import type { AssetKind } from "#/lib/media";

export function serveAsset(
  kind: AssetKind,
  bookId: string,
  request: Request,
): Response {
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
  const absPath = assetPath(config, book, kind);
  if (!absPath) {
    return jsonError(404, "ASSET_UNAVAILABLE", `This book has no ${kind}.`);
  }
  return kind === "audio"
    ? serveStreamedWithRange(absPath, request)
    : serveBuffered(absPath, request.signal);
}
