import { expect, test } from "bun:test";
import { APP_NAME } from "../align.ts";

test("workspace app is wired into the root test run", () => {
  expect(APP_NAME).toBe("align");
});
