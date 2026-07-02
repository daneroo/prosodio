import { describe, expect, test } from "bun:test";
import type { RootSet } from "./config.ts";
import { filterBySearch, matchRoot, type RootFiles } from "./discovery.ts";

const root: RootSet = {
  name: "private",
  transcriptionsDir: "/t",
  corporaDir: "/c",
};

const files = (partial: Partial<RootFiles>): RootFiles => ({
  vtts: [],
  m4bs: [],
  epubs: [],
  ...partial,
});

describe("matchRoot", () => {
  test("pairs vtt to m4b by basename and resolves the sibling epub", () => {
    const scan = matchRoot(
      root,
      files({
        vtts: ["/t/Author - Book 01.vtt"],
        m4bs: ["/c/Author - Series/Author - Book 01/Author - Book 01.m4b"],
        epubs: ["/c/Author - Series/Author - Book 01/Author - Book 01.epub"],
      }),
    );
    expect(scan.exclusions).toEqual([]);
    expect(scan.matched).toEqual([
      {
        root: "private",
        base: "Author - Book 01",
        vtt: "/t/Author - Book 01.vtt",
        m4b: "/c/Author - Series/Author - Book 01/Author - Book 01.m4b",
        epub: "/c/Author - Series/Author - Book 01/Author - Book 01.epub",
        relPath: "Author - Series/Author - Book 01/Author - Book 01.m4b",
      },
    ]);
  });

  test("reports a vtt with no m4b", () => {
    const scan = matchRoot(root, files({ vtts: ["/t/Lost Book.vtt"] }));
    expect(scan.matched).toEqual([]);
    expect(scan.exclusions).toEqual([
      {
        kind: "no-m4b",
        root: "private",
        base: "Lost Book",
        vtt: "/t/Lost Book.vtt",
      },
    ]);
  });

  test("reports duplicate m4b basenames instead of choosing one", () => {
    const scan = matchRoot(
      root,
      files({
        vtts: ["/t/Twice.vtt"],
        m4bs: ["/c/x/Twice/Twice.m4b", "/c/y/Twice/Twice.m4b"],
        epubs: ["/c/x/Twice/Twice.epub"],
      }),
    );
    expect(scan.matched).toEqual([]);
    expect(scan.exclusions).toEqual([
      {
        kind: "duplicate-m4b",
        root: "private",
        base: "Twice",
        vtt: "/t/Twice.vtt",
        m4bs: ["/c/x/Twice/Twice.m4b", "/c/y/Twice/Twice.m4b"],
      },
    ]);
  });

  test("reports a missing sibling epub with the epubs actually present", () => {
    const scan = matchRoot(
      root,
      files({
        vtts: ["/t/Book.vtt"],
        m4bs: ["/c/Book/Book.m4b"],
        epubs: ["/c/Book/Book (retail).epub"],
      }),
    );
    expect(scan.matched).toEqual([]);
    expect(scan.exclusions).toEqual([
      {
        kind: "no-epub",
        root: "private",
        base: "Book",
        vtt: "/t/Book.vtt",
        m4b: "/c/Book/Book.m4b",
        siblingEpubs: ["/c/Book/Book (retail).epub"],
      },
    ]);
  });

  test("output order is deterministic regardless of input order", () => {
    const shuffled = matchRoot(
      root,
      files({
        vtts: ["/t/B.vtt", "/t/A.vtt"],
        m4bs: ["/c/B/B.m4b", "/c/A/A.m4b"],
        epubs: ["/c/B/B.epub", "/c/A/A.epub"],
      }),
    );
    expect(shuffled.matched.map((t) => t.base)).toEqual(["A", "B"]);
  });
});

describe("filterBySearch", () => {
  const triplets = matchRoot(
    root,
    files({
      vtts: ["/t/Iain M. Banks - Culture 05 - Excession.vtt", "/t/Other.vtt"],
      m4bs: [
        "/c/Iain M. Banks - Culture/Iain M. Banks - Culture 05 - Excession/Iain M. Banks - Culture 05 - Excession.m4b",
        "/c/Other/Other.m4b",
      ],
      epubs: [
        "/c/Iain M. Banks - Culture/Iain M. Banks - Culture 05 - Excession/Iain M. Banks - Culture 05 - Excession.epub",
        "/c/Other/Other.epub",
      ],
    }),
  ).matched;

  test("every term must match, case-insensitively, over the relative path", () => {
    expect(
      filterBySearch(triplets, "culture excession").map((t) => t.base),
    ).toEqual(["Iain M. Banks - Culture 05 - Excession"]);
    expect(filterBySearch(triplets, "culture zzz")).toEqual([]);
  });

  test("an empty search keeps every match", () => {
    expect(filterBySearch(triplets, "  ")).toEqual(triplets);
  });
});
