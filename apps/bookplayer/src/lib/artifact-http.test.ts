import { describe, expect, test } from "bun:test";

import { artifactEtag, isNotModified, pickEncoding } from "./artifact-http.ts";
import type { ArtifactCacheKey } from "./artifact-cache.ts";

describe("artifactEtag", () => {
  test('shape: W/"a<schemaVersion>-<vttMtimeMs>-<epubMtimeMs>"', () => {
    const key: ArtifactCacheKey = {
      schemaVersion: 2,
      vttMtimeMs: 1000,
      epubMtimeMs: 2000,
    };
    expect(artifactEtag(key)).toBe('W/"a2-1000-2000"');
  });

  test("float mtimes are stringified as-is", () => {
    const key: ArtifactCacheKey = {
      schemaVersion: 3,
      vttMtimeMs: 1000.25,
      epubMtimeMs: 2000.5,
    };
    expect(artifactEtag(key)).toBe('W/"a3-1000.25-2000.5"');
  });
});

describe("isNotModified", () => {
  const etag = 'W/"a2-1000-2000"';

  test("null/undefined header never matches", () => {
    expect(isNotModified(null, etag)).toBe(false);
    expect(isNotModified(undefined, etag)).toBe(false);
    expect(isNotModified("", etag)).toBe(false);
  });

  test("exact single-value match", () => {
    expect(isNotModified(etag, etag)).toBe(true);
  });

  test("comma-separated list containing the etag matches", () => {
    expect(isNotModified(`W/"other", ${etag}`, etag)).toBe(true);
    expect(isNotModified(`${etag}, W/"other"`, etag)).toBe(true);
  });

  test("star matches anything", () => {
    expect(isNotModified("*", etag)).toBe(true);
  });

  test("mismatch returns false", () => {
    expect(isNotModified('W/"a2-1000-9999"', etag)).toBe(false);
    expect(isNotModified('W/"other1", W/"other2"', etag)).toBe(false);
  });
});

describe("pickEncoding", () => {
  test("null/empty header falls back to identity", () => {
    expect(pickEncoding(null, true)).toBe("identity");
    expect(pickEncoding(undefined, true)).toBe("identity");
    expect(pickEncoding("", true)).toBe("identity");
  });

  test("gz unavailable always identity, even with gzip in header", () => {
    expect(pickEncoding("gzip", false)).toBe("identity");
  });

  test("bare gzip token picks gzip", () => {
    expect(pickEncoding("gzip", true)).toBe("gzip");
  });

  test("gzip with nonzero q picks gzip", () => {
    expect(pickEncoding("gzip;q=0.5", true)).toBe("gzip");
  });

  test("gzip;q=0 is not acceptable, falls back to identity", () => {
    expect(pickEncoding("gzip;q=0", true)).toBe("identity");
  });

  test("x-gzip does not match the gzip token", () => {
    expect(pickEncoding("x-gzip", true)).toBe("identity");
  });

  test("list with gzip among other encodings picks gzip", () => {
    expect(pickEncoding("deflate, gzip, br", true)).toBe("gzip");
  });

  test("list without gzip falls back to identity", () => {
    expect(pickEncoding("deflate, br", true)).toBe("identity");
  });
});
