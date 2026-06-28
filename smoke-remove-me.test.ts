import { expect, test } from "bun:test";

// Temporary: satisfies `bun test` on the empty workspace. Remove when Epoch 1
// brings real tests.
test("smoke", () => {
  expect(true).toBe(true);
});
