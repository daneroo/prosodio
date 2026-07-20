import { afterEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { hygieneFindings } from "./hygiene.ts";
import type { ScanFinding } from "./types.ts";

const execFileAsync = promisify(execFile);

const tempDirs: Array<string> = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A fresh corpora dir at normal (0755) permissions — the outer mkdtemp
 *  scratch dir defaults to 0700, but corporaDir itself is a plain mkdirSync
 *  one level in, matching scan.test.ts's makeRoot() convention. */
function makeCorporaDir(): string {
  const base = mkdtempSync(join(tmpdir(), "corpus-hygiene-"));
  tempDirs.push(base);
  const corporaDir = join(base, "audiobooks");
  mkdirSync(corporaDir, { recursive: true });
  chmodSync(corporaDir, 0o755);
  return corporaDir;
}

function addDir(corporaDir: string, relDir: string, mode = 0o755): string {
  const dir = join(corporaDir, relDir);
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, mode);
  return dir;
}

function addFile(corporaDir: string, relPath: string, mode = 0o644): string {
  const filePath = join(corporaDir, relPath);
  writeFileSync(filePath, "");
  chmodSync(filePath, mode);
  return filePath;
}

function codesOf(findings: Array<ScanFinding>): Array<string> {
  return findings.map((f) => f.code);
}

describe("hygieneFindings — .DS_Store", () => {
  test("flags .DS_Store at the root level", async () => {
    const corporaDir = makeCorporaDir();
    addFile(corporaDir, ".DS_Store");

    const findings = await hygieneFindings(corporaDir);
    const dsStore = findings.find((f) => f.code === "ds-store");
    expect(dsStore?.relDir).toBe(".");
    expect(dsStore?.severity).toBe("warning");
  });

  test("flags .DS_Store nested inside a book directory", async () => {
    const corporaDir = makeCorporaDir();
    addDir(corporaDir, "Author - Book One");
    addFile(corporaDir, join("Author - Book One", ".DS_Store"));

    const findings = await hygieneFindings(corporaDir);
    const dsStore = findings.find((f) => f.code === "ds-store");
    expect(dsStore?.relDir).toBe("Author - Book One");
  });

  test("multiple .DS_Store files at different levels all fire", async () => {
    const corporaDir = makeCorporaDir();
    addFile(corporaDir, ".DS_Store");
    addDir(corporaDir, "Series");
    addFile(corporaDir, join("Series", ".DS_Store"));

    const findings = await hygieneFindings(corporaDir);
    const dsStores = findings.filter((f) => f.code === "ds-store");
    expect(dsStores.map((f) => f.relDir).sort()).toEqual([".", "Series"]);
  });

  // scanRoot's own walk skips dot entries entirely; hygiene's walk must not,
  // or .DS_Store (and any hidden dir contents) would go unseen.
  test("a .DS_Store inside a dot-directory is still seen (dot entries not skipped)", async () => {
    const corporaDir = makeCorporaDir();
    addDir(corporaDir, ".hidden");
    addFile(corporaDir, join(".hidden", ".DS_Store"));

    const findings = await hygieneFindings(corporaDir);
    const dsStore = findings.find((f) => f.code === "ds-store");
    expect(dsStore?.relDir).toBe(".hidden");
  });
});

describe("hygieneFindings — permission bits", () => {
  test("a file not 0644 is flagged with the actual octal in the detail", async () => {
    const corporaDir = makeCorporaDir();
    addFile(corporaDir, "loose.m4b", 0o600);

    const findings = await hygieneFindings(corporaDir);
    const badPerms = findings.filter((f) => f.code === "bad-perms");
    expect(badPerms).toHaveLength(1);
    expect(badPerms[0]?.relDir).toBe(".");
    expect(badPerms[0]?.detail).toContain("0600");
    expect(badPerms[0]?.detail).toContain("0644");
    expect(badPerms[0]?.severity).toBe("warning");
  });

  test("a directory not 0755 is flagged with the actual octal in the detail", async () => {
    const corporaDir = makeCorporaDir();
    addDir(corporaDir, "locked-dir", 0o700);

    const findings = await hygieneFindings(corporaDir);
    const badPerms = findings.filter((f) => f.code === "bad-perms");
    expect(badPerms).toHaveLength(1);
    expect(badPerms[0]?.relDir).toBe("locked-dir");
    expect(badPerms[0]?.detail).toContain("0700");
    expect(badPerms[0]?.detail).toContain("0755");
  });

  test("the corpora root itself is checked (relDir '.')", async () => {
    const corporaDir = makeCorporaDir();
    chmodSync(corporaDir, 0o700);
    try {
      const findings = await hygieneFindings(corporaDir);
      const badPerms = findings.filter(
        (f) => f.code === "bad-perms" && f.relDir === ".",
      );
      expect(badPerms).toHaveLength(1);
      expect(badPerms[0]?.detail).toContain("0700");
    } finally {
      chmodSync(corporaDir, 0o755);
    }
  });

  test("correct perms (0644 files, 0755 dirs) produce no bad-perms findings", async () => {
    const corporaDir = makeCorporaDir();
    addDir(corporaDir, "Author - Book One");
    addFile(corporaDir, join("Author - Book One", "Author - Book One.m4b"));
    addFile(corporaDir, join("Author - Book One", "cover.jpg"));

    const findings = await hygieneFindings(corporaDir);
    expect(codesOf(findings)).not.toContain("bad-perms");
  });

  test(".DS_Store files are exempt from the perm check (already flagged for existence)", async () => {
    const corporaDir = makeCorporaDir();
    addFile(corporaDir, ".DS_Store", 0o600);

    const findings = await hygieneFindings(corporaDir);
    expect(codesOf(findings)).toEqual(["ds-store"]);
  });
});

// xattr checks shell out to the macOS-only `xattr` binary; guard the whole
// suite by platform rather than pretending portability.
describe.skipIf(process.platform !== "darwin")(
  "hygieneFindings — extended attributes (darwin only)",
  () => {
    test("a non-provenance attribute is flagged, naming the attribute", async () => {
      const corporaDir = makeCorporaDir();
      const filePath = addFile(corporaDir, "tagged.m4b");
      await execFileAsync("xattr", ["-w", "user.test", "hello", filePath]);

      const findings = await hygieneFindings(corporaDir);
      const xattr = findings.filter((f) => f.code === "xattr");
      expect(xattr).toHaveLength(1);
      expect(xattr[0]?.relDir).toBe(".");
      expect(xattr[0]?.detail).toContain("user.test");
      expect(xattr[0]?.severity).toBe("warning");
    });

    test("a sole com.apple.provenance attribute is tolerated (nx Justfile special case)", async () => {
      const corporaDir = makeCorporaDir();
      const filePath = addFile(corporaDir, "provenance-only.m4b");
      try {
        await execFileAsync("xattr", [
          "-w",
          "com.apple.provenance",
          "x",
          filePath,
        ]);
      } catch {
        // Some macOS versions refuse to let this be set manually at all —
        // in that case there's nothing to tolerate and the test is moot.
        return;
      }

      const findings = await hygieneFindings(corporaDir);
      expect(codesOf(findings)).not.toContain("xattr");
    });

    test("provenance plus another attribute still fires, listing only the offending name", async () => {
      const corporaDir = makeCorporaDir();
      const filePath = addFile(corporaDir, "mixed.m4b");
      let provenanceSettable = true;
      try {
        await execFileAsync("xattr", [
          "-w",
          "com.apple.provenance",
          "x",
          filePath,
        ]);
      } catch {
        provenanceSettable = false;
      }
      await execFileAsync("xattr", ["-w", "user.other", "y", filePath]);

      const findings = await hygieneFindings(corporaDir);
      const xattr = findings.find((f) => f.code === "xattr");
      expect(xattr).toBeDefined();
      expect(xattr?.detail).toContain("user.other");
      if (provenanceSettable) {
        expect(xattr?.detail).not.toContain("com.apple.provenance");
      }
    });

    test("no xattrs at all produces no xattr findings", async () => {
      const corporaDir = makeCorporaDir();
      addFile(corporaDir, "clean.m4b");

      const findings = await hygieneFindings(corporaDir);
      expect(codesOf(findings)).not.toContain("xattr");
    });
  },
);
