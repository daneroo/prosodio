import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanReports, ensureReportsRepo } from "./report.ts";

describe("private reports repo lifecycle", () => {
  test("ensureReportsRepo creates the dir with a nested git repo, idempotently", () => {
    const dir = mkdtempSync(join(tmpdir(), "align-reports-"));
    ensureReportsRepo(dir);
    expect(existsSync(join(dir, ".git"))).toBe(true);
    ensureReportsRepo(dir); // must not fail or re-init
    expect(existsSync(join(dir, ".git"))).toBe(true);
  });

  test("cleanReports deletes generated files but preserves the nested .git", () => {
    const dir = mkdtempSync(join(tmpdir(), "align-reports-"));
    ensureReportsRepo(dir);
    writeFileSync(join(dir, "summary.json"), "{}");
    ensureReportsRepo(join(dir, "private"));
    cleanReports(dir);
    expect(existsSync(join(dir, ".git"))).toBe(true);
    expect(existsSync(join(dir, "summary.json"))).toBe(false);
    expect(existsSync(join(dir, "private"))).toBe(false);
  });
});
