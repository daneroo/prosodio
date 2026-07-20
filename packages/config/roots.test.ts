import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveRoot, resolveRoots } from "./roots.ts";

const tempDirs: Array<string> = [];

function makeRepoSkeleton(): string {
  const root = mkdtempSync(join(tmpdir(), "prosodio-config-"));
  tempDirs.push(root);
  mkdirSync(join(root, "fixtures", "audiobooks"), { recursive: true });
  mkdirSync(join(root, "fixtures", "transcriptions"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveRoots", () => {
  test("builds the fixtures root anchored at the repo root", () => {
    const repo = makeRepoSkeleton();
    const roots = resolveRoots(repo, {});
    const fixtures = roots.find((r) => r.name === "fixtures");
    expect(fixtures?.corporaDir).toBe(join(repo, "fixtures", "audiobooks"));
    expect(fixtures?.transcriptionsDir).toBe(
      join(repo, "fixtures", "transcriptions"),
    );
  });

  test("builds the private root from AUDIOBOOKS_ROOT/VTT_DIR overrides, defaulting otherwise", () => {
    const repo = makeRepoSkeleton();
    const roots = resolveRoots(repo, {});
    const privateDefault = roots.find((r) => r.name === "private");
    expect(privateDefault?.corporaDir).toBe(
      "/Volumes/Space/Reading/audiobooks",
    );
    expect(privateDefault?.transcriptionsDir).toBe(
      join(repo, "data", "transcribe", "output"),
    );

    const corpora = mkdtempSync(join(tmpdir(), "prosodio-corpora-"));
    const vtts = mkdtempSync(join(tmpdir(), "prosodio-vtts-"));
    tempDirs.push(corpora, vtts);
    const overridden = resolveRoots(repo, {
      AUDIOBOOKS_ROOT: corpora,
      VTT_DIR: vtts,
    }).find((r) => r.name === "private");
    expect(overridden?.corporaDir).toBe(corpora);
    expect(overridden?.transcriptionsDir).toBe(vtts);
  });
});

describe("resolveRoot", () => {
  test("selects and validates the private root with env overrides", () => {
    const repo = makeRepoSkeleton();
    const corpora = mkdtempSync(join(tmpdir(), "prosodio-corpora-"));
    const vtts = mkdtempSync(join(tmpdir(), "prosodio-vtts-"));
    tempDirs.push(corpora, vtts);

    const root = resolveRoot(
      repo,
      { AUDIOBOOKS_ROOT: corpora, VTT_DIR: vtts },
      "private",
      "SOME_ROOT_VAR",
    );
    expect(root.name).toBe("private");
    expect(root.corporaDir).toBe(corpora);
    expect(root.transcriptionsDir).toBe(vtts);
  });

  test("an unknown root name is rejected, naming the caller's selection var", () => {
    const repo = makeRepoSkeleton();
    expect(() => resolveRoot(repo, {}, "corpus", "SOME_ROOT_VAR")).toThrow(
      /SOME_ROOT_VAR="corpus" is not a known root/,
    );
  });

  test("selecting private with a missing corpora dir fails fast naming the variable", () => {
    const repo = makeRepoSkeleton();
    const vtts = mkdtempSync(join(tmpdir(), "prosodio-vtts-"));
    tempDirs.push(vtts);

    expect(() =>
      resolveRoot(
        repo,
        { AUDIOBOOKS_ROOT: join(repo, "no-such-volume"), VTT_DIR: vtts },
        "private",
        "SOME_ROOT_VAR",
      ),
    ).toThrow(/private root corporaDir .*AUDIOBOOKS_ROOT.*does not exist/);
  });

  test("a broken fixtures root fails fast naming root and role", () => {
    const repo = makeRepoSkeleton();
    rmSync(join(repo, "fixtures", "transcriptions"), { recursive: true });
    expect(() => resolveRoot(repo, {}, "fixtures", "SOME_ROOT_VAR")).toThrow(
      /fixtures root transcriptionsDir .*does not exist/,
    );
  });
});
