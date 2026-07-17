/**
 * Shared handler behind the four /api/<kind>/$bookId routes: validate the
 * id, resolve the book and asset inside the active root, and serve with the
 * right semantics. Audio body ownership is selected explicitly by its route.
 */
import { getConfig } from "#/lib/config";
import { getLibrary } from "#/lib/library";
import {
  BOOK_ID_RE,
  assetPath,
  jsonError,
  serveFile,
  serveStreamedWithRange,
} from "#/lib/media";
import type { AssetKind, AudioBodyStrategy } from "#/lib/media";

type ServeAssetOptions = {
  audioBodyStrategy?: AudioBodyStrategy;
};

export function serveAsset(
  kind: AssetKind,
  bookId: string,
  request: Request,
  options: ServeAssetOptions = {},
): Response {
  const resolved = resolveAsset(kind, bookId);
  if (resolved instanceof Response) return resolved;

  return kind === "audio"
    ? serveStreamedWithRange(resolved, request, options.audioBodyStrategy)
    : serveFile(resolved, request.signal);
}

/** Resolve one validated library asset without choosing a response transport. */
export function resolveAsset(
  kind: AssetKind,
  bookId: string,
): string | Response {
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
  return absPath;
}
