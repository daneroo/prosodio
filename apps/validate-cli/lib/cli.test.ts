import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProbeFn, ProbeResult } from "@prosodio/corpus";
import {
  exitCode,
  HintsUsageError,
  hintsPathFor,
  recordMtimes,
  renderHuman,
  renderJson,
  renderRecordMtimes,
  resolvePlan,
  runValidation,
  type RunResult,
} from "./cli.ts";

// Same anchoring as validate.ts (import.meta.dir -> repo root), so these
// tests exercise resolvePlan/runValidation against the real committed
// fixtures without any network/ffprobe dependency (stub probes below).
const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const NO_ENV = {};

function emptyProbe(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    durationSec: null,
    bitrateKbps: null,
    codec: null,
    titleTag: null,
    artistTag: null,
    groupingTag: null,
    composerTag: null,
    ...overrides,
  };
}

/** Stub probe: every book "succeeds" with a title tag, so no fallback finding
 *  and no ffprobe binary is required in CI. */
const stubProbeOk: ProbeFn = () =>
  Promise.resolve(
    emptyProbe({
      durationSec: 1,
      bitrateKbps: 64,
      codec: "aac",
      titleTag: "Stubbed Title",
    }),
  );

describe("resolvePlan", () => {
  test("named root (fixtures) resolves to its configured dirs", () => {
    const plan = resolvePlan(["fixtures"], REPO_ROOT, NO_ENV);
    expect(plan.kind).toBe("run");
    if (plan.kind !== "run") return;
    expect(plan.corpusRoot.name).toBe("fixtures");
    expect(plan.corpusRoot.corporaDir).toBe(
      join(REPO_ROOT, "fixtures", "audiobooks"),
    );
    expect(plan.corpusRoot.transcriptionsDir).toBe(
      join(REPO_ROOT, "fixtures", "transcriptions"),
    );
    expect(plan.probe).toBe(true);
    expect(plan.json).toBe(false);
  });

  test("named root with a missing directory is a usage error naming the env override", () => {
    const plan = resolvePlan(["private"], REPO_ROOT, {
      AUDIOBOOKS_ROOT: "/definitely/not/a/real/path",
    });
    expect(plan.kind).toBe("usage");
    if (plan.kind !== "usage") return;
    expect(plan.message).toContain("AUDIOBOOKS_ROOT");
  });

  test("bare path: an existing directory becomes a read-only, transcriptions-less root", () => {
    const dir = mkdtempSync(join(tmpdir(), "validate-cli-bare-"));
    try {
      const plan = resolvePlan([dir], REPO_ROOT, NO_ENV);
      expect(plan.kind).toBe("run");
      if (plan.kind !== "run") return;
      expect(plan.corpusRoot.corporaDir).toBe(dir);
      expect(plan.corpusRoot.name).toBe(dir);
      expect(plan.corpusRoot.transcriptionsDir).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("bare path: a non-existent directory is a usage error", () => {
    const plan = resolvePlan(
      ["/definitely/not/a/real/path"],
      REPO_ROOT,
      NO_ENV,
    );
    expect(plan.kind).toBe("usage");
  });

  test("--no-probe and --json flags parse alongside the positional", () => {
    const plan = resolvePlan(
      ["fixtures", "--no-probe", "--json"],
      REPO_ROOT,
      NO_ENV,
    );
    expect(plan.kind).toBe("run");
    if (plan.kind !== "run") return;
    expect(plan.probe).toBe(false);
    expect(plan.json).toBe(true);
  });

  test("no argument is a usage error", () => {
    const plan = resolvePlan([], REPO_ROOT, NO_ENV);
    expect(plan.kind).toBe("usage");
  });

  test("unknown flag is a usage error", () => {
    const plan = resolvePlan(["fixtures", "--bogus"], REPO_ROOT, NO_ENV);
    expect(plan.kind).toBe("usage");
  });

  test("a second positional argument is a usage error", () => {
    const plan = resolvePlan(["fixtures", "private"], REPO_ROOT, NO_ENV);
    expect(plan.kind).toBe("usage");
  });
});

describe("verdict / exit mapping", () => {
  function result(overrides: Partial<RunResult> = {}): RunResult {
    return {
      root: "fixtures",
      corporaDir: "/x",
      books: 4,
      probed: true,
      unprobed: 0,
      findings: [],
      failures: 0,
      warnings: 0,
      pass: true,
      hints: "skipped",
      ...overrides,
    };
  }

  test("zero failures is PASS, exit 0, even with warnings", () => {
    const r = result({ warnings: 2, pass: true });
    expect(renderHuman(r)).toContain("PASS (0 failures, 2 warnings)");
    expect(exitCode(r)).toBe(0);
  });

  test("any failures is FAIL, exit 1", () => {
    const r = result({ failures: 1, warnings: 2, pass: false });
    expect(renderHuman(r)).toContain("FAIL (1 failures, 2 warnings)");
    expect(exitCode(r)).toBe(1);
  });

  test("renderJson emits the documented flat shape", () => {
    const r = result();
    const parsed = JSON.parse(renderJson(r));
    expect(parsed).toEqual(r);
  });
});

describe("runValidation", () => {
  function makeRoot(): { base: string; corporaDir: string } {
    const base = mkdtempSync(join(tmpdir(), "validate-cli-run-"));
    const corporaDir = join(base, "audiobooks");
    mkdirSync(corporaDir, { recursive: true });
    // Forced rather than relying on umask (hygieneFindings now runs
    // unconditionally in runValidation; see packages/corpus/hygiene.test.ts's
    // makeCorporaDir for the same precedent) — keeps these tests deterministic
    // regardless of the environment's default permissions.
    chmodSync(corporaDir, 0o755);
    return { base, corporaDir };
  }

  function addBook(corporaDir: string, relDir: string): void {
    const dir = join(corporaDir, relDir);
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o755);
    const m4bPath = join(dir, `${relDir}.m4b`);
    writeFileSync(m4bPath, "");
    chmodSync(m4bPath, 0o644);
    const coverPath = join(dir, "cover.jpg");
    writeFileSync(coverPath, "");
    chmodSync(coverPath, 0o644);
  }

  test("a probe succeeding with usedBasenameFallback emits metadata-basename-fallback", async () => {
    const { base, corporaDir } = makeRoot();
    try {
      addBook(corporaDir, "No Title Tag Book");
      const probeFn: ProbeFn = () =>
        Promise.resolve(emptyProbe({ durationSec: 1 }));
      const result = await runValidation(
        { name: "test", corporaDir },
        { probe: true, probeFn },
      );
      expect(result.books).toBe(1);
      expect(result.unprobed).toBe(0);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.code).toBe("metadata-basename-fallback");
      expect(result.findings[0]?.severity).toBe("warning");
      expect(result.failures).toBe(0);
      expect(result.warnings).toBe(1);
      expect(result.pass).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("a probe failure (durationSec null) counts as unprobed, not a finding", async () => {
    const { base, corporaDir } = makeRoot();
    try {
      addBook(corporaDir, "Some Book");
      const probeFn: ProbeFn = () => Promise.resolve(emptyProbe());
      const result = await runValidation(
        { name: "test", corporaDir },
        { probe: true, probeFn },
      );
      expect(result.books).toBe(1);
      expect(result.unprobed).toBe(1);
      expect(result.findings).toHaveLength(0);
      expect(result.pass).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("--no-probe skips probing entirely: every book is unprobed", async () => {
    const { base, corporaDir } = makeRoot();
    try {
      addBook(corporaDir, "Some Book");
      const result = await runValidation(
        { name: "test", corporaDir },
        { probe: false, probeFn: stubProbeOk },
      );
      expect(result.probed).toBe(false);
      expect(result.unprobed).toBe(1);
      expect(result.findings).toHaveLength(0);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  // Deep-rule findings on the real fixtures/audiobooks tree (a committed
  // .DS_Store, possible provenance xattrs from fixture setup) are
  // environment-dependent, so this only pins the behavioral guarantee
  // (acceptance #1: PASS survives the "no hints DB yet" bootstrap warning) —
  // not an exact findings count.
  test("end-to-end: the committed fixtures root scans 4 books and PASSes (hints DB not yet recorded)", async () => {
    const plan = resolvePlan(["fixtures"], REPO_ROOT, NO_ENV);
    expect(plan.kind).toBe("run");
    if (plan.kind !== "run") return;
    const result = await runValidation(plan.corpusRoot, {
      probe: true,
      probeFn: stubProbeOk,
      hintsPath: plan.hintsPath,
    });
    expect(result.books).toBe(4);
    expect(result.failures).toBe(0);
    expect(result.pass).toBe(true);
    expect(exitCode(result)).toBe(0);
    expect(result.hints).toBe("missing");
    expect(result.findings.some((f) => f.code === "mtime-hints-missing")).toBe(
      true,
    );
    expect(renderHuman(result)).toContain("PASS (0 failures,");
  });
});

describe("hints loading", () => {
  function makeRepo(): { repoRoot: string; corporaDir: string } {
    const repoRoot = mkdtempSync(join(tmpdir(), "validate-cli-hints-"));
    const corporaDir = join(repoRoot, "audiobooks");
    mkdirSync(corporaDir, { recursive: true });
    chmodSync(corporaDir, 0o755);
    return { repoRoot, corporaDir };
  }

  function addBook(corporaDir: string, relDir: string): string {
    const dir = join(corporaDir, relDir);
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o755);
    const m4bPath = join(dir, `${relDir}.m4b`);
    writeFileSync(m4bPath, "");
    chmodSync(m4bPath, 0o644);
    const coverPath = join(dir, "cover.jpg");
    writeFileSync(coverPath, "");
    chmodSync(coverPath, 0o644);
    return m4bPath;
  }

  test("hintsPathFor derives <repoRoot>/data/validate/mtime/<rootName>.mtime-hints.json", () => {
    expect(hintsPathFor("/repo", "private")).toBe(
      join("/repo", "data", "validate", "mtime", "private.mtime-hints.json"),
    );
  });

  test("named root, no hints file yet: hints 'missing', a single mtime-hints-missing warning", async () => {
    const { repoRoot, corporaDir } = makeRepo();
    try {
      addBook(corporaDir, "Some Book");
      const hintsPath = hintsPathFor(repoRoot, "private");
      const result = await runValidation(
        { name: "private", corporaDir },
        { probe: false, hintsPath },
      );
      expect(result.hints).toBe("missing");
      const mtimeFindings = result.findings.filter((f) =>
        f.code.startsWith("mtime"),
      );
      expect(mtimeFindings).toHaveLength(1);
      expect(mtimeFindings[0]?.code).toBe("mtime-hints-missing");
      expect(mtimeFindings[0]?.severity).toBe("warning");
      expect(result.pass).toBe(true);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test("named root with a valid hints file: hints 'loaded', mtime rules exercised", async () => {
    const { repoRoot, corporaDir } = makeRepo();
    try {
      const m4bPath = addBook(corporaDir, "Some Book");
      const hintsPath = hintsPathFor(repoRoot, "private");
      mkdirSync(join(repoRoot, "data", "validate", "mtime"), {
        recursive: true,
      });
      utimesSync(m4bPath, 0, 0);
      utimesSync(join(corporaDir, "Some Book"), 0, 0);
      writeFileSync(
        hintsPath,
        JSON.stringify({ "Some Book": new Date(0).toISOString() }),
      );
      const result = await runValidation(
        { name: "private", corporaDir },
        { probe: false, hintsPath },
      );
      expect(result.hints).toBe("loaded");
      expect(result.findings.some((f) => f.code.startsWith("mtime"))).toBe(
        false,
      );
      expect(result.pass).toBe(true);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test("named root with a malformed hints file: HintsUsageError, naming the path", async () => {
    const { repoRoot, corporaDir } = makeRepo();
    try {
      addBook(corporaDir, "Some Book");
      const hintsPath = hintsPathFor(repoRoot, "private");
      mkdirSync(join(repoRoot, "data", "validate", "mtime"), {
        recursive: true,
      });
      writeFileSync(hintsPath, "{ not valid json");
      await expect(
        runValidation(
          { name: "private", corporaDir },
          { probe: false, hintsPath },
        ),
      ).rejects.toThrow(HintsUsageError);
      await expect(
        runValidation(
          { name: "private", corporaDir },
          { probe: false, hintsPath },
        ),
      ).rejects.toThrow(hintsPath);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test("bare path: mtime rules skip entirely — no mtime-hints-missing warning at all", async () => {
    const { repoRoot, corporaDir } = makeRepo();
    try {
      addBook(corporaDir, "Some Book");
      // No hintsPath passed at all — mirrors resolvePlan's bare-path branch,
      // which leaves RunPlan.hintsPath undefined.
      const result = await runValidation(
        { name: corporaDir, corporaDir },
        { probe: false },
      );
      expect(result.hints).toBe("skipped");
      expect(result.findings.some((f) => f.code.startsWith("mtime"))).toBe(
        false,
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});

describe("deep rules flow through runValidation", () => {
  function makeRoot(): { base: string; corporaDir: string } {
    const base = mkdtempSync(join(tmpdir(), "validate-cli-deep-"));
    const corporaDir = join(base, "audiobooks");
    mkdirSync(corporaDir, { recursive: true });
    chmodSync(corporaDir, 0o755);
    return { base, corporaDir };
  }

  function addBook(corporaDir: string, relDir: string): string {
    const dir = join(corporaDir, relDir);
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o755);
    const m4bPath = join(dir, `${relDir}.m4b`);
    writeFileSync(m4bPath, "");
    chmodSync(m4bPath, 0o644);
    const coverPath = join(dir, "cover.jpg");
    writeFileSync(coverPath, "");
    chmodSync(coverPath, 0o644);
    return m4bPath;
  }

  test("a chmod'd file yields the bad-perms hygiene warning in the run result", async () => {
    const { base, corporaDir } = makeRoot();
    try {
      const m4bPath = addBook(corporaDir, "Some Book");
      chmodSync(m4bPath, 0o600);
      const result = await runValidation(
        { name: "test", corporaDir },
        { probe: false },
      );
      const badPerms = result.findings.filter((f) => f.code === "bad-perms");
      expect(badPerms).toHaveLength(1);
      expect(badPerms[0]?.severity).toBe("warning");
      expect(result.pass).toBe(true); // warning only, doesn't fail the run
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("a recorded mtime later disturbed by utimesSync yields mtime-mismatch and fails the run", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "validate-cli-deep-repo-"));
    try {
      const corporaDir = join(repoRoot, "audiobooks");
      mkdirSync(corporaDir, { recursive: true });
      chmodSync(corporaDir, 0o755);
      addBook(corporaDir, "Some Book");
      const hintsPath = hintsPathFor(repoRoot, "private");

      const recordResult = await recordMtimes(
        { name: "private", corporaDir },
        hintsPath,
      );
      expect(recordResult.recorded).toHaveLength(1);

      const okResult = await runValidation(
        { name: "private", corporaDir },
        { probe: false, hintsPath },
      );
      expect(okResult.pass).toBe(true);

      const m4bPath = join(corporaDir, "Some Book", "Some Book.m4b");
      const future = Date.now() / 1000 + 3600;
      utimesSync(m4bPath, future, future);

      const failResult = await runValidation(
        { name: "private", corporaDir },
        { probe: false, hintsPath },
      );
      expect(failResult.pass).toBe(false);
      expect(failResult.findings.some((f) => f.code === "mtime-mismatch")).toBe(
        true,
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});

describe("recordMtimes", () => {
  function makeRepo(): { repoRoot: string; corporaDir: string } {
    const repoRoot = mkdtempSync(join(tmpdir(), "validate-cli-record-"));
    const corporaDir = join(repoRoot, "audiobooks");
    mkdirSync(corporaDir, { recursive: true });
    chmodSync(corporaDir, 0o755);
    return { repoRoot, corporaDir };
  }

  function addBook(corporaDir: string, relDir: string): void {
    const dir = join(corporaDir, relDir);
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o755);
    const m4bPath = join(dir, `${relDir}.m4b`);
    writeFileSync(m4bPath, "");
    chmodSync(m4bPath, 0o644);
    const coverPath = join(dir, "cover.jpg");
    writeFileSync(coverPath, "");
    chmodSync(coverPath, 0o644);
  }

  test("record-then-validate round-trip: record, validate passes; add a book, validate fails; record again appends only the new book", async () => {
    const { repoRoot, corporaDir } = makeRepo();
    try {
      addBook(corporaDir, "Book One");
      const hintsPath = hintsPathFor(repoRoot, "private");
      const corpusRoot = { name: "private", corporaDir };

      const firstRecord = await recordMtimes(corpusRoot, hintsPath);
      expect(firstRecord.recorded.map((e) => e.basename)).toEqual(["Book One"]);
      expect(firstRecord.alreadyPresent).toBe(0);
      expect(renderRecordMtimes(firstRecord)).toContain("recorded: Book One ");
      expect(renderRecordMtimes(firstRecord)).toContain(
        "1 recorded, 0 already present",
      );

      const passResult = await runValidation(corpusRoot, {
        probe: false,
        hintsPath,
      });
      expect(passResult.pass).toBe(true);

      addBook(corporaDir, "Book Two");
      const failResult = await runValidation(corpusRoot, {
        probe: false,
        hintsPath,
      });
      expect(failResult.pass).toBe(false);
      expect(failResult.findings.some((f) => f.code === "mtime-absent")).toBe(
        true,
      );

      const secondRecord = await recordMtimes(corpusRoot, hintsPath);
      expect(secondRecord.recorded.map((e) => e.basename)).toEqual([
        "Book Two",
      ]);
      expect(secondRecord.alreadyPresent).toBe(1);

      const passAgain = await runValidation(corpusRoot, {
        probe: false,
        hintsPath,
      });
      expect(passAgain.pass).toBe(true);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test("atomicity/no-overwrite: an existing entry survives a record run byte-for-byte (value unchanged)", async () => {
    const { repoRoot, corporaDir } = makeRepo();
    try {
      addBook(corporaDir, "Book One");
      const hintsPath = hintsPathFor(repoRoot, "private");
      const corpusRoot = { name: "private", corporaDir };

      await recordMtimes(corpusRoot, hintsPath);
      const before = JSON.parse(readFileSync(hintsPath, "utf8")) as Record<
        string,
        string
      >;
      const originalValue = before["Book One"];
      expect(originalValue).toBeDefined();

      addBook(corporaDir, "Book Two");
      const second = await recordMtimes(corpusRoot, hintsPath);
      expect(second.recorded.map((e) => e.basename)).toEqual(["Book Two"]);

      const after = JSON.parse(readFileSync(hintsPath, "utf8")) as Record<
        string,
        string
      >;
      expect(after["Book One"]).toBe(originalValue);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test("nothing to record: says so, no write occurs", async () => {
    const { repoRoot, corporaDir } = makeRepo();
    try {
      addBook(corporaDir, "Book One");
      const hintsPath = hintsPathFor(repoRoot, "private");
      const corpusRoot = { name: "private", corporaDir };

      await recordMtimes(corpusRoot, hintsPath);
      const result = await recordMtimes(corpusRoot, hintsPath);
      expect(result.recorded).toHaveLength(0);
      expect(result.alreadyPresent).toBe(1);
      expect(renderRecordMtimes(result)).toContain(
        "nothing to record (1 already present)",
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});

describe("resolvePlan — --record-mtimes", () => {
  test("named root: resolves to a record-mtimes plan with a computed hintsPath", () => {
    const plan = resolvePlan(
      ["fixtures", "--record-mtimes"],
      REPO_ROOT,
      NO_ENV,
    );
    expect(plan.kind).toBe("record-mtimes");
    if (plan.kind !== "record-mtimes") return;
    expect(plan.hintsPath).toBe(hintsPathFor(REPO_ROOT, "fixtures"));
  });

  test("bare path + --record-mtimes is a usage error", () => {
    const dir = mkdtempSync(join(tmpdir(), "validate-cli-record-bare-"));
    try {
      const plan = resolvePlan([dir, "--record-mtimes"], REPO_ROOT, NO_ENV);
      expect(plan.kind).toBe("usage");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--record-mtimes combined with --json is a usage error", () => {
    const plan = resolvePlan(
      ["fixtures", "--record-mtimes", "--json"],
      REPO_ROOT,
      NO_ENV,
    );
    expect(plan.kind).toBe("usage");
  });
});
