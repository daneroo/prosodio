import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alignBook, alignConfig } from "@prosodio/align";
import { config } from "./config.ts";
import {
  bookReportSchema,
  buildBookReport,
  cleanReports,
  ensureReportsRepo,
  type ReportSource,
} from "./report.ts";

const vttText = await Bun.file(config.aliceVtt).text();
const epubBytes = await Bun.file(config.aliceEpub).arrayBuffer();
const source: ReportSource = {
  root: "fixtures",
  base: "Lewis Carroll - Alices Adventures in Wonderland",
  vttPath: config.aliceVtt,
  epubPath: config.aliceEpub,
  m4bPath: null,
};

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

describe("buildBookReport", async () => {
  const alignment = await alignBook(vttText, epubBytes);
  const report = buildBookReport(alignment, source);

  test("validates against the strict schema and survives a JSON round-trip", () => {
    const reparsed = bookReportSchema.parse(JSON.parse(JSON.stringify(report)));
    expect(reparsed).toEqual(report);
  });

  test("serialization is deterministic byte-for-byte", async () => {
    const again = buildBookReport(await alignBook(vttText, epubBytes), source);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });

  test("spans carry addresses, time ranges, and pass evidence", () => {
    for (const span of report.spans) {
      expect(span.addresses.length).toBeGreaterThanOrEqual(1);
      expect(span.vttEndSec).toBeGreaterThanOrEqual(span.vttStartSec);
    }
    const passIds = new Set(report.spans.map((s) => s.passId));
    expect(
      passIds.has(`pass1-exact-k${alignConfig.passes.pass1NgramSize}`),
    ).toBe(true);
    expect(
      passIds.has(`proof-exact-k${alignConfig.passes.proofNgramSize}`),
    ).toBe(true);
  });

  test("review samples cover edges and interior with reviewable text", () => {
    const strata = report.reviewSamples.map((s) => s.stratum);
    expect(strata).toContain("edge-first");
    expect(strata).toContain("edge-last");
    expect(strata).toContain("interior");
    for (const sample of report.reviewSamples) {
      expect(sample.vttText.length).toBeGreaterThan(0);
      expect(sample.epubText.length).toBeGreaterThan(0);
    }
  });

  test("echoes source provenance and configuration", () => {
    expect(report.source.vttTiming).toBe("interpolated");
    expect(report.source.vttProvenance).not.toBeNull();
    expect(report.config.normalizationPolicy).toBe(
      alignConfig.normalizationPolicy,
    );
    expect(report.config.extraction.domParser).toBe("jsdom");
    expect(report.config.extraction.parseMode).toBe("xhtml-or-html-fallback");
  });
});
