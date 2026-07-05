/**
 * Server functions: the loaders' data surface. Rows are lean — ids, display
 * fields, capability flags — never filesystem paths.
 */
import { createServerFn } from "@tanstack/react-start";

import { loadAlignment, loadEpubAnchor } from "#/lib/alignment";
import { getConfig } from "#/lib/config";
import { getLibrary } from "#/lib/library";
import { BOOK_ID_RE } from "#/lib/media";
import { loadTranscript } from "#/lib/transcript";
import type { BookRecord } from "#/lib/types";

export interface BookRow {
  id: string;
  title: string;
  author: string | null;
  durationSec: number | null;
  sizeBytes: number;
  hasEpub: boolean;
  hasVtt: boolean;
}

function toRow(book: BookRecord): BookRow {
  return {
    id: book.id,
    title: book.metadata.title,
    author: book.metadata.author,
    durationSec: book.metadata.durationSec,
    sizeBytes: book.metadata.sizeBytes,
    hasEpub: book.epubRelPath !== null,
    hasVtt: book.hasVtt,
  };
}

function validBookId(bookId: string): string {
  if (typeof bookId !== "string" || !BOOK_ID_RE.test(bookId)) {
    throw new Error("Invalid book id.");
  }
  return bookId;
}

const library = () => getLibrary(getConfig());

export const fetchLibrary = createServerFn({ method: "GET" }).handler(() => {
  const lib = library();
  const index = lib.getIndex();
  return {
    rootName: index.rootName,
    books: index.books.map(toRow),
    scannedAt: index.scannedAt,
    scanDurationMs: index.scanDurationMs,
    warningCount: index.warnings.length,
    scanning: lib.isScanning(),
  };
});

export const fetchBook = createServerFn({ method: "GET" })
  .validator(validBookId)
  .handler(({ data: bookId }) => {
    library().getIndex();
    const book = library().getBook(bookId);
    if (!book) throw new Error("Book not found.");
    return toRow(book);
  });

export const fetchTranscript = createServerFn({ method: "GET" })
  .validator(validBookId)
  .handler(({ data: bookId }) => {
    library().getIndex();
    const book = library().getBook(bookId);
    if (!book) throw new Error("Book not found.");
    return { cues: loadTranscript(getConfig(), book) };
  });

/**
 * Alignment for the AlignmentViewer. First call for a book runs the engine
 * (seconds to minutes on large books) and caches; later calls join from the
 * cache. GET so the loader/client can treat it like the transcript.
 */
export const fetchAlignment = createServerFn({ method: "GET" })
  .validator(validBookId)
  .handler(async ({ data: bookId }) => {
    library().getIndex();
    const book = library().getBook(bookId);
    if (!book) throw new Error("Book not found.");
    const config = getConfig();
    return loadAlignment(config, book, loadTranscript(config, book));
  });

/** "Show in book": EPUB anchor (href + searchable excerpt) for a cue. */
export const fetchEpubAnchor = createServerFn({ method: "GET" })
  .validator((input: { bookId: string; cueIndex: number }) => {
    validBookId(input.bookId);
    if (!Number.isInteger(input.cueIndex) || input.cueIndex < 0) {
      throw new Error("Invalid cue index.");
    }
    return input;
  })
  .handler(async ({ data }) => {
    library().getIndex();
    const book = library().getBook(data.bookId);
    if (!book) throw new Error("Book not found.");
    return { anchor: await loadEpubAnchor(getConfig(), book, data.cueIndex) };
  });

export const triggerRescan = createServerFn({ method: "POST" }).handler(() => {
  const lib = library();
  const started = lib.refresh();
  const index = lib.getIndex();
  return {
    started,
    bookCount: index.books.length,
    scannedAt: index.scannedAt,
    scanDurationMs: index.scanDurationMs,
  };
});
