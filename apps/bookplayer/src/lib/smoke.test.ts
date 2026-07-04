/**
 * Phase 1 smoke test: proves the root `bun test` run discovers this app's
 * tests. Real suites (scan/library/media/config/transcript) arrive in
 * Phases 2-4.
 */
import { expect, test } from "bun:test";

import pkg from "../../package.json";

test("bookplayer is a workspace member with root-run tests", () => {
  expect(pkg.name).toBe("@prosodio/bookplayer");
});
