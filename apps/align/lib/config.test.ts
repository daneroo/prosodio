import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { config } from "./config.ts";

test("repo-root anchoring resolves the committed fixtures", () => {
  expect(existsSync(config.fixturesDir)).toBe(true);
  expect(existsSync(config.aliceVtt)).toBe(true);
  expect(existsSync(config.aliceEpub)).toBe(true);
  // aliceM4b is gitignored/refetched — never assert its presence.
});

test("both discovery roots are configured", () => {
  const names = config.roots.map((r) => r.name);
  expect(names).toEqual(["fixtures", "private"]);
  for (const root of config.roots) {
    expect(root.transcriptionsDir.length).toBeGreaterThan(0);
    expect(root.corporaDir.length).toBeGreaterThan(0);
  }
});
