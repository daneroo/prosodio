import { describe, expect, test } from "bun:test";

import {
  isTransientMediaDiagnosticError,
  parseRepeat,
  repeatLinks,
} from "./burn-in.ts";

describe("burn-in repetition", () => {
  test("repeats a fixed 20-book selection five times in exact order", () => {
    const books = Array.from({ length: 20 }, (_, index) => `book-${index + 1}`);

    const repeated = repeatLinks(books, 5);

    expect(repeated).toHaveLength(100);
    for (let pass = 0; pass < 5; pass++) {
      expect(
        repeated.slice(pass * books.length, (pass + 1) * books.length),
      ).toEqual(books);
    }
  });

  test("defaults to one pass and accepts positive integers", () => {
    expect(parseRepeat(undefined)).toBe(1);
    expect(parseRepeat("5")).toBe(5);
  });

  test("rejects zero and non-integers", () => {
    expect(() => parseRepeat("0")).toThrow("--repeat must be at least 1");
    expect(() => parseRepeat("1.5")).toThrow("--repeat must be an integer");
  });
});

describe("media diagnostic navigation races", () => {
  test("classifies context destruction and detached handles as transient", () => {
    expect(
      isTransientMediaDiagnosticError(
        new Error(
          "elementHandle.evaluate: Execution context was destroyed, most likely because of a navigation",
        ),
      ),
    ).toBeTrue();
    expect(
      isTransientMediaDiagnosticError(
        new Error("Element is not attached to the DOM"),
      ),
    ).toBeTrue();
  });

  test("does not classify unrelated evaluate or browser-close errors", () => {
    expect(
      isTransientMediaDiagnosticError(new Error("Media assertion failed")),
    ).toBeFalse();
    expect(
      isTransientMediaDiagnosticError(
        new Error("Target page, context or browser has been closed"),
      ),
    ).toBeFalse();
  });
});
