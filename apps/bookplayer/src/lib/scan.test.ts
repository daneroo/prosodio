import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  classifyMatch,
  makeBookId,
  normalizeBasename,
  parseBasename,
  scanRoot,
} from "./scan.ts";
import type { RootSet } from "./config.ts";
import type { ScanFindingCode } from "./types.ts";

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

function codesOf(findings: Array<{ code: ScanFindingCode }>): Array<string> {
  return findings.map((f) => f.code);
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

    const { books, findings } = scanRoot(root);
    expect(books).toHaveLength(1);
    const book = books[0];
    if (!book) throw new Error("expected one book");
    expect(book.id).toMatch(/^[a-f0-9]{12}$/);
    expect(book.basename).toBe("Author - Book One");
    expect(book.coverRelPath).toBe(join("Author - Book One", "cover.jpg"));
    expect(book.epubRelPath).toBe(
      join("Author - Book One", "Author - Book One.epub"),
    );
    expect(book.epubMatch).toBe("exact");
    expect(book.hasVtt).toBe(true);
    expect(book.vttMatch).toBe("exact");
    expect(book.metadata.author).toBe("Author");
    expect(book.metadata.title).toBe("Book One");
    expect(findings).toHaveLength(0);
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
    expect(books[0]?.epubRelPath).toBeNull();
    expect(books[0]?.epubMatch).toBe("absent");
    expect(books[0]?.hasVtt).toBe(false);
    expect(books[0]?.vttMatch).toBe("absent");
  });

  test("orphan assets never become books", () => {
    const root = makeRoot();
    addBook(root, "orphan-epub", ["Lonely.epub", "cover.jpg"]);
    addBook(root, "no-cover", ["Bare.m4b"]);
    writeFileSync(join(root.transcriptionsDir, "Ghost.vtt"), "WEBVTT");

    const { books, findings } = scanRoot(root);
    expect(books).toHaveLength(0);
    const finding = findings.find((f) => f.relDir === "no-cover");
    expect(finding?.code).toBe("no-cover");
    expect(finding?.detail).toContain("no cover");
  });

  test("multiple m4b files exclude the directory with a finding", () => {
    const root = makeRoot();
    addBook(root, "double", ["One.m4b", "Two.m4b", "cover.jpg"]);

    const { books, findings } = scanRoot(root);
    expect(books).toHaveLength(0);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("multi-m4b");
    expect(findings[0]?.relDir).toBe("double");
    expect(findings[0]?.detail).toContain("single-m4b invariant");
  });

  // Skipped when running as root (e.g. some container CI images): root
  // bypasses the permission bits this test relies on to force readdirSync
  // to fail.
  const runningAsRoot =
    typeof process.getuid === "function" && process.getuid() === 0;
  test.skipIf(runningAsRoot)(
    "unreadable directory records a finding and the walk continues",
    () => {
      const root = makeRoot();
      addBook(root, "sibling", ["Sibling.m4b", "cover.jpg"]);
      const blockedDir = join(root.corporaDir, "blocked");
      mkdirSync(blockedDir);
      chmodSync(blockedDir, 0o000);
      try {
        const { books, findings } = scanRoot(root);
        expect(books.map((b) => b.basename)).toEqual(["Sibling"]);
        const finding = findings.find((f) => f.relDir === "blocked");
        expect(finding?.code).toBe("unreadable-dir");
        expect(finding?.detail).toContain("unreadable directory");
      } finally {
        chmodSync(blockedDir, 0o755);
      }
    },
  );

  test("epub basename mismatch classifies as mismatch, not a finding", () => {
    const root = makeRoot();
    addBook(root, "mismatch", [
      "Audio Name.m4b",
      "Text Name.epub",
      "cover.jpg",
    ]);

    const { books, findings } = scanRoot(root);
    expect(books).toHaveLength(1);
    expect(books[0]?.epubRelPath).toBe(join("mismatch", "Text Name.epub"));
    expect(books[0]?.epubMatch).toBe("mismatch");
    // The old prose "basename mismatch" warning is gone entirely — match
    // quality replaces it, not a finding code.
    expect(codesOf(findings)).not.toContain("basename-mismatch");
    expect(findings).toHaveLength(0);
  });

  test("epub basename differing only by case/punctuation classifies as near", () => {
    const root = makeRoot();
    addBook(root, "near-epub", [
      "Author - Book One.m4b",
      "author - book one!.epub",
      "cover.jpg",
    ]);

    const { books } = scanRoot(root);
    expect(books[0]?.epubMatch).toBe("near");
  });

  test("vtt exact name is present and hasVtt true", () => {
    const root = makeRoot();
    addBook(root, "vtt-exact", ["Vtt Exact.m4b", "cover.jpg"]);
    writeFileSync(join(root.transcriptionsDir, "Vtt Exact.vtt"), "WEBVTT");

    const { books } = scanRoot(root);
    expect(books[0]?.vttMatch).toBe("exact");
    expect(books[0]?.hasVtt).toBe(true);
  });

  test("vtt case-variant name in the transcriptions dir classifies as near but hasVtt stays false", () => {
    const root = makeRoot();
    addBook(root, "vtt-near", ["Vtt Near.m4b", "cover.jpg"]);
    // Case-only difference from the m4b basename.
    writeFileSync(join(root.transcriptionsDir, "VTT NEAR.vtt"), "WEBVTT");

    const { books } = scanRoot(root);
    expect(books[0]?.vttMatch).toBe("near");
    // hasVtt (playback contract) is unaffected by grading — near is
    // evidence for the align-soft-basename-match backlog item only.
    expect(books[0]?.hasVtt).toBe(false);
  });

  test("no vtt candidate at all classifies as absent", () => {
    const root = makeRoot();
    addBook(root, "vtt-absent", ["Vtt Absent.m4b", "cover.jpg"]);

    const { books } = scanRoot(root);
    expect(books[0]?.vttMatch).toBe("absent");
    expect(books[0]?.hasVtt).toBe(false);
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
    expect(books[0]?.relDir).toBe(join("series", "part one", "deep"));
  });

  test("duplicate basenames: first sorted relDir wins, rest carry a finding", () => {
    const root = makeRoot();
    addBook(root, join("a", "dup"), ["Same Book.m4b", "cover.jpg"]);
    addBook(root, join("b", "dup"), ["Same Book.m4b", "cover.jpg"]);

    const { books, findings } = scanRoot(root);
    expect(books).toHaveLength(1);
    expect(books[0]?.relDir).toBe(join("a", "dup"));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("duplicate-basename");
    expect(findings[0]?.detail).toContain("duplicate basename");
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

describe("normalizeBasename", () => {
  test("lowercases and trims", () => {
    expect(normalizeBasename("  My Book  ")).toBe("my book");
  });

  test("collapses internal whitespace runs to one space", () => {
    expect(normalizeBasename("My    Book")).toBe("my book");
  });

  test("strips punctuation but keeps letters, numbers, and spaces", () => {
    expect(normalizeBasename("Author - Book: Part 2!")).toBe(
      "author book part 2",
    );
  });

  test("applies Unicode NFKC normalization", () => {
    // "cafe" with an acute accent: precomposed (NFC, "\u00e9") vs.
    // "e" + a combining acute accent (NFD, "e\u0301").
    const precomposed = "caf\u00e9";
    const decomposed = "cafe\u0301";
    expect(precomposed).not.toBe(decomposed); // sanity: distinct code units
    expect(normalizeBasename(precomposed)).toBe(normalizeBasename(decomposed));
  });
});

describe("classifyMatch", () => {
  test("identical strings are exact", () => {
    expect(classifyMatch("Author - Book", "Author - Book")).toBe("exact");
  });

  test("case-only difference is near", () => {
    expect(classifyMatch("Author - Book", "author - book")).toBe("near");
  });

  test("punctuation-only difference is near", () => {
    expect(classifyMatch("Author - Book!", "Author Book")).toBe("near");
  });

  test("unrelated strings are a mismatch", () => {
    expect(classifyMatch("Author - Book One", "Totally Different")).toBe(
      "mismatch",
    );
  });
});
