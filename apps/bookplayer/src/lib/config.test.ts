import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findRepoRoot, resolveConfig } from "./config.ts";

const tempDirs: Array<string> = [];

function makeRepoSkeleton(): string {
  const root = mkdtempSync(join(tmpdir(), "bookplayer-config-"));
  tempDirs.push(root);
  mkdirSync(join(root, "fixtures", "audiobooks"), { recursive: true });
  mkdirSync(join(root, "fixtures", "transcriptions"), { recursive: true });
  writeFileSync(join(root, "package.json"), "{}");
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveConfig", () => {
  test("defaults to the fixtures root anchored at the repo root", () => {
    const repo = makeRepoSkeleton();
    const config = resolveConfig(repo, {});
    expect(config.activeRoot.name).toBe("fixtures");
    expect(config.activeRoot.corporaDir).toBe(
      join(repo, "fixtures", "audiobooks"),
    );
    expect(config.activeRoot.transcriptionsDir).toBe(
      join(repo, "fixtures", "transcriptions"),
    );
    expect(config.cacheFile).toBe(
      join(repo, "data", "bookplayer", "cache", "index.json"),
    );
  });

  test("BOOKPLAYER_ROOT=private with env overrides selects and validates them", () => {
    const repo = makeRepoSkeleton();
    const corpora = mkdtempSync(join(tmpdir(), "bookplayer-corpora-"));
    const vtts = mkdtempSync(join(tmpdir(), "bookplayer-vtts-"));
    tempDirs.push(corpora, vtts);

    const config = resolveConfig(repo, {
      BOOKPLAYER_ROOT: "private",
      AUDIOBOOKS_ROOT: corpora,
      VTT_DIR: vtts,
    });
    expect(config.activeRoot.name).toBe("private");
    expect(config.activeRoot.corporaDir).toBe(corpora);
    expect(config.activeRoot.transcriptionsDir).toBe(vtts);
  });

  // Root-model/validation cases (unknown name, missing dirs) moved to
  // packages/config/roots.test.ts with resolveConfig's own composition
  // (BOOKPLAYER_ROOT naming) covered separately below.
  test("an unknown BOOKPLAYER_ROOT value is rejected, naming BOOKPLAYER_ROOT", () => {
    const repo = makeRepoSkeleton();
    expect(() => resolveConfig(repo, { BOOKPLAYER_ROOT: "corpus" })).toThrow(
      /BOOKPLAYER_ROOT="corpus" is not a known root/,
    );
  });
});

describe("findRepoRoot", () => {
  test("accepts the repo root itself", () => {
    const repo = makeRepoSkeleton();
    expect(findRepoRoot(repo)).toBe(repo);
  });

  test("accepts an app dir two levels down", () => {
    const repo = makeRepoSkeleton();
    const appDir = join(repo, "apps", "bookplayer");
    mkdirSync(appDir, { recursive: true });
    expect(findRepoRoot(appDir)).toBe(repo);
  });

  test("fails loudly elsewhere", () => {
    const stray = mkdtempSync(join(tmpdir(), "bookplayer-stray-"));
    tempDirs.push(stray);
    expect(() => findRepoRoot(stray)).toThrow(/Cannot locate the prosodio/);
  });
});
