import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProbeFn, ProbeResult } from "@prosodio/corpus";
import {
  exitCode,
  renderHuman,
  renderJson,
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
    return { base, corporaDir };
  }

  function addBook(corporaDir: string, relDir: string): void {
    const dir = join(corporaDir, relDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${relDir}.m4b`), "");
    writeFileSync(join(dir, "cover.jpg"), "");
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

  test("end-to-end: the committed fixtures root scans 4 books, 0 findings, PASS", async () => {
    const plan = resolvePlan(["fixtures"], REPO_ROOT, NO_ENV);
    expect(plan.kind).toBe("run");
    if (plan.kind !== "run") return;
    const result = await runValidation(plan.corpusRoot, {
      probe: true,
      probeFn: stubProbeOk,
    });
    expect(result.books).toBe(4);
    expect(result.findings).toHaveLength(0);
    expect(result.failures).toBe(0);
    expect(result.pass).toBe(true);
    expect(exitCode(result)).toBe(0);
    expect(renderHuman(result)).toContain("PASS (0 failures, 0 warnings)");
  });
});
