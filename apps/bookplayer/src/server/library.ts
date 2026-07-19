/**
 * Server functions: the loaders' data surface. Rows are lean — ids, display
 * fields, capability flags — never filesystem paths.
 */
import { createServerFn } from "@tanstack/react-start";

import { getConfig } from "#/lib/config";
import { getLibrary } from "#/lib/library";
import { BOOK_ID_RE } from "#/lib/media";
import { loadTranscript } from "#/lib/transcript";
import type { BookRecord, MatchClass } from "#/lib/types";

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

/** Lean lab row (plan lab-routes-refined S2): relDir is fine to expose here
 *  — /lab is dev-only and this still stays clear of absolute paths. */
export interface ScanReportBookRow {
  id: string;
  title: string;
  author: string | null;
  relDir: string;
  basename: string;
  hasEpub: boolean;
  hasVtt: boolean;
  epubMatch: MatchClass;
  vttMatch: MatchClass;
  sizeBytes: number;
  durationSec: number | null;
}

function toScanReportRow(book: BookRecord): ScanReportBookRow {
  return {
    id: book.id,
    title: book.metadata.title,
    author: book.metadata.author,
    relDir: book.relDir,
    basename: book.basename,
    hasEpub: book.epubRelPath !== null,
    hasVtt: book.hasVtt,
    epubMatch: book.epubMatch,
    vttMatch: book.vttMatch,
    sizeBytes: book.metadata.sizeBytes,
    durationSec: book.metadata.durationSec,
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
    findingCount: index.findings.length,
    scanning: lib.isScanning(),
  };
});

/** Lab-only: the Corpora tab's data source (findings + graded match
 *  quality, plan lab-routes-refined S2). Not consumed by the home page. */
export const fetchScanReport = createServerFn({ method: "GET" }).handler(() => {
  const index = library().getIndex();
  return {
    rootName: index.rootName,
    scannedAt: index.scannedAt,
    findings: index.findings,
    books: index.books.map(toScanReportRow),
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
