import { describe, expect, test } from "bun:test";

import { serveMemoryUsage } from "./memory.ts";

describe("serveMemoryUsage", () => {
  test("returns only uncached RSS bytes", async () => {
    const response = serveMemoryUsage();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["rssBytes"]);
    expect(body.rssBytes).toBeNumber();
    expect(body.rssBytes).toBeGreaterThanOrEqual(0);
  });
});
