import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mtimeFindings } from "./mtime.ts";
import { scanRoot } from "./scan.ts";
import type { CorpusRoot, MtimeHints } from "./types.ts";

const tempDirs: Array<string> = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeRoot(): CorpusRoot {
  const base = mkdtempSync(join(tmpdir(), "corpus-mtime-"));
  tempDirs.push(base);
  const corporaDir = join(base, "audiobooks");
  mkdirSync(corporaDir, { recursive: true });
  return { name: "fixtures", corporaDir };
}

function addBook(root: CorpusRoot, relDir: string, files: Array<string>): void {
  const dir = join(root.corporaDir, relDir);
  mkdirSync(dir, { recursive: true });
  for (const file of files) writeFileSync(join(dir, file), "");
}

/** utimesSync accepts fractional seconds, so sub-second precision (needed
 *  for the granularity-tolerance test) round-trips on filesystems that
 *  support it. */
function setMtimes(
  root: CorpusRoot,
  relDir: string,
  m4bName: string,
  epochMs: { m4b?: number; dir?: number },
): void {
  if (epochMs.m4b !== undefined) {
    const seconds = epochMs.m4b / 1000;
    utimesSync(join(root.corporaDir, relDir, m4bName), seconds, seconds);
  }
  if (epochMs.dir !== undefined) {
    const seconds = epochMs.dir / 1000;
    utimesSync(join(root.corporaDir, relDir), seconds, seconds);
  }
}

const HINT_ISO = "2026-01-01T00:00:00Z";
const HINT_EPOCH_MS = Date.parse(HINT_ISO);
const RELDIR = "Author - Book One";
const M4B_NAME = "Author - Book One.m4b";

function scanOneBook(root: CorpusRoot) {
  addBook(root, RELDIR, [M4B_NAME, "cover.jpg"]);
  return root;
}

describe("mtimeFindings — bootstrap", () => {
  test("hints === null yields exactly one mtime-hints-missing warning, nothing else", () => {
    const root = scanOneBook(makeRoot());
    const { books } = scanRoot(root);

    const findings = mtimeFindings(books, null, root.corporaDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("mtime-hints-missing");
    expect(findings[0]?.relDir).toBe(".");
    expect(findings[0]?.severity).toBe("warning");
  });
});

describe("mtimeFindings — per-book comparison", () => {
  test("a book with no hint entry is mtime-absent (failure)", () => {
    const root = scanOneBook(makeRoot());
    const { books } = scanRoot(root);

    const findings = mtimeFindings(books, {}, root.corporaDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("mtime-absent");
    expect(findings[0]?.bookId).toBe(books[0]?.id);
    expect(findings[0]?.severity).toBe("failure");
  });

  test("matching m4b and dir mtimes produce no finding", () => {
    const root = scanOneBook(makeRoot());
    setMtimes(root, RELDIR, M4B_NAME, {
      m4b: HINT_EPOCH_MS,
      dir: HINT_EPOCH_MS,
    });
    const { books } = scanRoot(root);

    const hints: MtimeHints = { [RELDIR]: HINT_ISO };
    expect(mtimeFindings(books, hints, root.corporaDir)).toHaveLength(0);
  });

  test("second-granularity tolerance: same second, different ms is clean", () => {
    const root = scanOneBook(makeRoot());
    setMtimes(root, RELDIR, M4B_NAME, {
      m4b: HINT_EPOCH_MS + 500,
      dir: HINT_EPOCH_MS + 250,
    });
    const { books } = scanRoot(root);

    const hints: MtimeHints = { [RELDIR]: HINT_ISO };
    expect(mtimeFindings(books, hints, root.corporaDir)).toHaveLength(0);
  });

  test("m4b-only mismatch names 'm4b' in the detail", () => {
    const root = scanOneBook(makeRoot());
    setMtimes(root, RELDIR, M4B_NAME, {
      m4b: HINT_EPOCH_MS + 60_000,
      dir: HINT_EPOCH_MS,
    });
    const { books } = scanRoot(root);

    const hints: MtimeHints = { [RELDIR]: HINT_ISO };
    const findings = mtimeFindings(books, hints, root.corporaDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("mtime-mismatch");
    expect(findings[0]?.detail).toContain("(m4b)");
    expect(findings[0]?.bookId).toBe(books[0]?.id);
    expect(findings[0]?.severity).toBe("failure");
  });

  test("dir-only mismatch names 'dir' in the detail", () => {
    const root = scanOneBook(makeRoot());
    setMtimes(root, RELDIR, M4B_NAME, {
      m4b: HINT_EPOCH_MS,
      dir: HINT_EPOCH_MS + 60_000,
    });
    const { books } = scanRoot(root);

    const hints: MtimeHints = { [RELDIR]: HINT_ISO };
    const findings = mtimeFindings(books, hints, root.corporaDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detail).toContain("(dir)");
  });

  test("both m4b and dir mismatching names 'both' in the detail", () => {
    const root = scanOneBook(makeRoot());
    setMtimes(root, RELDIR, M4B_NAME, {
      m4b: HINT_EPOCH_MS + 60_000,
      dir: HINT_EPOCH_MS + 120_000,
    });
    const { books } = scanRoot(root);

    const hints: MtimeHints = { [RELDIR]: HINT_ISO };
    const findings = mtimeFindings(books, hints, root.corporaDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detail).toContain("(both)");
  });
});

describe("mtimeFindings — orphan hints", () => {
  test("a hint key matching no book is an orphan-hint warning", () => {
    const root = scanOneBook(makeRoot());
    setMtimes(root, RELDIR, M4B_NAME, {
      m4b: HINT_EPOCH_MS,
      dir: HINT_EPOCH_MS,
    });
    const { books } = scanRoot(root);

    const hints: MtimeHints = {
      [RELDIR]: HINT_ISO,
      "Ghost Book": HINT_ISO,
    };
    const findings = mtimeFindings(books, hints, root.corporaDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("orphan-hint");
    expect(findings[0]?.relDir).toBe(".");
    expect(findings[0]?.detail).toContain("Ghost Book");
    expect(findings[0]?.severity).toBe("warning");
  });
});
