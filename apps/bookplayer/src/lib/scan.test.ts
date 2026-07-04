import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeBookId, parseBasename, scanRoot } from "./scan.ts";
import type { RootSet } from "./config.ts";

const tempDirs: Array<string> = [];

function makeRoot(): RootSet {
  const base = mkdtempSync(join(tmpdir(), "bookplayer-scan-"));
  tempDirs.push(base);
  const corporaDir = join(base, "audiobooks");
  const transcriptionsDir = join(base, "transcriptions");
  mkdirSync(corporaDir, { recursive: true });
  mkdirSync(transcriptionsDir, { recursive: true });
  return { name: "fixtures", corporaDir, transcriptionsDir };
}

function addBook(root: RootSet, relDir: string, files: Array<string>): void {
  const dir = join(root.corporaDir, relDir);
  mkdirSync(dir, { recursive: true });
  for (const file of files) writeFileSync(join(dir, file), "");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("scanRoot grouping", () => {
  test("canonical book with cover.jpg, epub and vtt capabilities", () => {
    const root = makeRoot();
    addBook(root, "Author - Book One", [
      "Author - Book One.m4b",
      "Author - Book One.epub",
      "cover.jpg",
    ]);
    writeFileSync(
      join(root.transcriptionsDir, "Author - Book One.vtt"),
      "WEBVTT",
    );

    const { books, warnings } = scanRoot(root);
    expect(books).toHaveLength(1);
    const book = books[0];
    expect(book.id).toMatch(/^[a-f0-9]{12}$/);
    expect(book.basename).toBe("Author - Book One");
    expect(book.coverRelPath).toBe(join("Author - Book One", "cover.jpg"));
    expect(book.epubRelPath).toBe(
      join("Author - Book One", "Author - Book One.epub"),
    );
    expect(book.hasVtt).toBe(true);
    expect(book.metadata.author).toBe("Author");
    expect(book.metadata.title).toBe("Book One");
    expect(warnings).toHaveLength(0);
  });

  test("cover.png fallback and jpg preference", () => {
    const root = makeRoot();
    addBook(root, "png-only", ["A.m4b", "cover.png"]);
    addBook(root, "both-covers", ["B.m4b", "cover.jpg", "cover.png"]);

    const { books } = scanRoot(root);
    const pngBook = books.find((b) => b.basename === "A");
    const bothBook = books.find((b) => b.basename === "B");
    expect(pngBook?.coverRelPath).toBe(join("png-only", "cover.png"));
    expect(bothBook?.coverRelPath).toBe(join("both-covers", "cover.jpg"));
  });

  test("epub and vtt are optional capabilities, not requirements", () => {
    const root = makeRoot();
    addBook(root, "audio-only", ["Solo.m4b", "cover.jpg"]);

    const { books } = scanRoot(root);
    expect(books).toHaveLength(1);
    expect(books[0].epubRelPath).toBeNull();
    expect(books[0].hasVtt).toBe(false);
  });

  test("orphan assets never become books", () => {
    const root = makeRoot();
    addBook(root, "orphan-epub", ["Lonely.epub", "cover.jpg"]);
    addBook(root, "no-cover", ["Bare.m4b"]);
    writeFileSync(join(root.transcriptionsDir, "Ghost.vtt"), "WEBVTT");

    const { books, warnings } = scanRoot(root);
    expect(books).toHaveLength(0);
    expect(warnings.join("\n")).toContain("no cover");
  });

  test("multiple m4b files exclude the directory with a warning", () => {
    const root = makeRoot();
    addBook(root, "double", ["One.m4b", "Two.m4b", "cover.jpg"]);

    const { books, warnings } = scanRoot(root);
    expect(books).toHaveLength(0);
    expect(warnings.join("\n")).toContain("single-m4b invariant");
  });

  test("basename mismatch still groups by folder but warns", () => {
    const root = makeRoot();
    addBook(root, "mismatch", [
      "Audio Name.m4b",
      "Text Name.epub",
      "cover.jpg",
    ]);

    const { books, warnings } = scanRoot(root);
    expect(books).toHaveLength(1);
    expect(books[0].epubRelPath).toBe(join("mismatch", "Text Name.epub"));
    expect(warnings.join("\n")).toContain("basename mismatch");
  });

  test("hidden files and directories are skipped", () => {
    const root = makeRoot();
    addBook(root, ".hidden-dir", ["Ghost.m4b", "cover.jpg"]);
    addBook(root, "visible", ["Real.m4b", "cover.jpg", ".DS_Store"]);

    const { books } = scanRoot(root);
    expect(books.map((b) => b.basename)).toEqual(["Real"]);
  });

  test("books nest at any depth", () => {
    const root = makeRoot();
    addBook(root, join("series", "part one", "deep"), [
      "Deep.m4b",
      "cover.jpg",
    ]);

    const { books } = scanRoot(root);
    expect(books).toHaveLength(1);
    expect(books[0].relDir).toBe(join("series", "part one", "deep"));
  });

  test("duplicate basenames: first sorted relDir wins, rest warn", () => {
    const root = makeRoot();
    addBook(root, join("a", "dup"), ["Same Book.m4b", "cover.jpg"]);
    addBook(root, join("b", "dup"), ["Same Book.m4b", "cover.jpg"]);

    const { books, warnings } = scanRoot(root);
    expect(books).toHaveLength(1);
    expect(books[0].relDir).toBe(join("a", "dup"));
    expect(warnings.join("\n")).toContain("duplicate basename");
  });

  test("output is sorted by basename", () => {
    const root = makeRoot();
    addBook(root, "z", ["Zeta.m4b", "cover.jpg"]);
    addBook(root, "a", ["Alpha.m4b", "cover.jpg"]);

    const { books } = scanRoot(root);
    expect(books.map((b) => b.basename)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("makeBookId", () => {
  test("is a stable 12-hex digest of the normalized basename", () => {
    expect(makeBookId("My Book")).toBe(makeBookId("  my book ".trim()));
    expect(makeBookId("My Book")).toMatch(/^[a-f0-9]{12}$/);
    expect(makeBookId("My Book")).not.toBe(makeBookId("My Other Book"));
  });
});

describe("parseBasename", () => {
  test("author - title", () => {
    expect(parseBasename("Iain M. Banks - Use Of Weapons")).toEqual({
      author: "Iain M. Banks",
      title: "Use Of Weapons",
    });
  });

  test("author - series - title takes the last segment as title", () => {
    expect(
      parseBasename("Iain M. Banks - Culture 03 - Use Of Weapons"),
    ).toEqual({ author: "Iain M. Banks", title: "Use Of Weapons" });
  });

  test("no separator: all title", () => {
    expect(parseBasename("Standalone")).toEqual({
      author: null,
      title: "Standalone",
    });
  });
});
