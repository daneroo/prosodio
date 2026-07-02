import { describe, expect, test } from "bun:test";
import { alignBook } from "./align-book.ts";
import { config } from "./config.ts";
import { alignmentResultSchema, buildAlignmentResult } from "./result.ts";

const vttText = await Bun.file(config.aliceVtt).text();
const source = {
  root: "fixtures",
  base: "Lewis Carroll - Alices Adventures in Wonderland",
  vttPath: config.aliceVtt,
  epubPath: config.aliceEpub,
  m4bPath: null,
};

describe("buildAlignmentResult", async () => {
  const alignment = await alignBook(vttText, config.aliceEpub);
  const result = buildAlignmentResult(alignment, source);

  test("validates against the strict schema and survives a JSON round-trip", () => {
    const reparsed = alignmentResultSchema.parse(
      JSON.parse(JSON.stringify(result)),
    );
    expect(reparsed).toEqual(result);
  });

  test("serialization is deterministic byte-for-byte", async () => {
    const again = buildAlignmentResult(
      await alignBook(vttText, config.aliceEpub),
      source,
    );
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));
  });

  test("spans carry addresses, time ranges, and pass evidence", () => {
    for (const span of result.spans) {
      expect(span.addresses.length).toBeGreaterThanOrEqual(1);
      expect(span.vttEndSec).toBeGreaterThanOrEqual(span.vttStartSec);
    }
    const passIds = new Set(result.spans.map((s) => s.passId));
    expect(passIds.has(`pass1-exact-k${config.passes.pass1NgramSize}`)).toBe(
      true,
    );
    expect(passIds.has(`proof-exact-k${config.passes.proofNgramSize}`)).toBe(
      true,
    );
  });

  test("echoes source provenance and configuration", () => {
    expect(result.source.vttTiming).toBe("interpolated");
    expect(result.source.vttProvenance).not.toBeNull();
    expect(result.config.normalizationPolicy).toBe(config.normalizationPolicy);
    expect(result.config.extraction.domParser).toBe("jsdom");
  });
});
