import { describe, expect, test } from "bun:test";

import { serveMemoryUsage } from "./memory.ts";

describe("serveMemoryUsage", () => {
  test("returns byte telemetry without caching in development", async () => {
    const response = serveMemoryUsage(true);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = (await response.json()) as Record<string, unknown>;
    for (const field of [
      "rssBytes",
      "heapUsedBytes",
      "heapTotalBytes",
      "externalBytes",
      "arrayBuffersBytes",
    ]) {
      expect(body[field]).toBeNumber();
      expect(body[field]).toBeGreaterThanOrEqual(0);
    }
  });

  test("is inaccessible outside development", () => {
    const response = serveMemoryUsage(false);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
