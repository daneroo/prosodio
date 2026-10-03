import { describe, expect, test } from "bun:test";

import {
  buildIdentityMap,
  createIdentityMapStore,
  parseItemsList,
} from "./identity-map.ts";
import type { AudiobookshelfItem, IdentityMap } from "./identity-map.ts";

const item = (id: string, relPath: string, title = id): AudiobookshelfItem => ({
  id,
  relPath,
  title,
});

describe("buildIdentityMap", () => {
  test("maps a flat relPath to the book with that directory", () => {
    const map = buildIdentityMap(
      [item("li_1", "Tony Fadell - Build")],
      [{ id: "book1", relDir: "Tony Fadell - Build" }],
    );
    expect(map.resolve("li_1")).toEqual({ bookId: "book1" });
  });

  test("maps a nested Author/Title relPath", () => {
    const map = buildIdentityMap(
      [item("li_1", "Beatrix Potter/Peter Rabbit")],
      [
        { id: "other", relDir: "Beatrix Potter" },
        { id: "book1", relDir: "Beatrix Potter/Peter Rabbit" },
      ],
    );
    expect(map.resolve("li_1")).toEqual({ bookId: "book1" });
  });

  test("matches across Unicode normalization forms and a trailing slash", () => {
    const map = buildIdentityMap(
      [item("li_1", "José Saramago - Blindness/")],
      [{ id: "book1", relDir: "José Saramago - Blindness" }],
    );
    expect(map.resolve("li_1")).toEqual({ bookId: "book1" });
  });

  test("an item with no matching directory is unmatched, with its title", () => {
    const map = buildIdentityMap(
      [item("li_1", "Somewhere Else", "A Title")],
      [{ id: "book1", relDir: "Tony Fadell - Build" }],
    );
    expect(map.resolve("li_1")).toEqual({ unmatched: true, title: "A Title" });
  });

  test("an id audiobookshelf never listed is unknown", () => {
    const map = buildIdentityMap([], [{ id: "book1", relDir: "A" }]);
    expect(map.resolve("li_nope")).toEqual({ unknown: true });
  });

  test("counts items, matched, unmatched and books audiobookshelf lacks", () => {
    const map = buildIdentityMap(
      [item("li_1", "A"), item("li_2", "B"), item("li_3", "Nowhere")],
      [
        { id: "a", relDir: "A" },
        { id: "b", relDir: "B" },
        { id: "c", relDir: "C" },
        { id: "d", relDir: "D" },
      ],
    );
    expect(map.counts).toEqual({
      items: 3,
      matched: 2,
      unmatched: 1,
      books: 4,
      booksNotInAudiobookshelf: 2,
    });
  });
});

describe("parseItemsList", () => {
  test("keeps id, relPath and title from a minified items list", () => {
    const items = parseItemsList({
      results: [
        {
          id: "li_1",
          relPath: "Tony Fadell - Build",
          isFile: false,
          media: { metadata: { title: "Build", authorName: "Tony Fadell" } },
        },
        { id: "li_2", relPath: "Untitled", media: { metadata: {} } },
      ],
      total: 2,
    });
    expect(items).toEqual([
      { id: "li_1", relPath: "Tony Fadell - Build", title: "Build" },
      { id: "li_2", relPath: "Untitled", title: "Untitled" },
    ]);
  });

  test("skips a malformed item instead of failing the whole list", () => {
    const items = parseItemsList({
      results: [
        { id: "li_1", relPath: "A", media: { metadata: { title: "A" } } },
        { id: "li_2", media: {} },
      ],
    });
    expect(items).toEqual([{ id: "li_1", relPath: "A", title: "A" }]);
  });

  test("rejects a response that isn't an items list", () => {
    expect(() => parseItemsList({ error: "nope" })).toThrow();
  });
});

describe("identity map store", () => {
  const mapOf = (entries: Record<string, string>): IdentityMap =>
    buildIdentityMap(
      Object.entries(entries).map(([id, relDir]) => item(id, relDir)),
      Object.values(entries).map((relDir) => ({ id: `b-${relDir}`, relDir })),
    );

  function setup(builds: Array<IdentityMap | Error>) {
    let clock = 0;
    let loads = 0;
    const store = createIdentityMapStore({
      load: () => {
        const next = builds[Math.min(loads, builds.length - 1)];
        loads += 1;
        return next instanceof Error
          ? Promise.reject(next)
          : Promise.resolve(next as IdentityMap);
      },
      now: () => clock,
      log: () => {},
    });
    return {
      store,
      loads: () => loads,
      advance: (ms: number) => (clock += ms),
    };
  }

  test("resolve waits for the startup build", async () => {
    const { store } = setup([mapOf({ li_1: "A" })]);
    store.start();
    expect(await store.resolve("li_1")).toEqual({ bookId: "b-A" });
  });

  test("a miss rebuilds at most once a minute", async () => {
    const { store, loads, advance } = setup([
      mapOf({}),
      mapOf({}),
      mapOf({ li_new: "N" }),
    ]);
    store.start();
    expect(await store.resolve("li_new")).toEqual({ unknown: true });
    expect(loads()).toBe(1);
    advance(60_000);
    expect(await store.resolve("li_new")).toEqual({ unknown: true });
    expect(loads()).toBe(2);
    advance(30_000);
    expect(await store.resolve("li_new")).toEqual({ unknown: true });
    expect(loads()).toBe(2);
    advance(30_000);
    expect(await store.resolve("li_new")).toEqual({ bookId: "b-N" });
    expect(loads()).toBe(3);
  });

  test("a failed build leaves the map unknown and never throws", async () => {
    const { store, advance } = setup([
      new Error("audiobookshelf down"),
      mapOf({ li_1: "A" }),
    ]);
    store.start();
    expect(await store.resolve("li_1")).toEqual({ unknown: true });
    advance(60_000);
    expect(await store.resolve("li_1")).toEqual({ bookId: "b-A" });
  });

  test("a hit does not rebuild", async () => {
    const { store, loads, advance } = setup([mapOf({ li_1: "A" })]);
    store.start();
    await store.resolve("li_1");
    advance(120_000);
    expect(await store.resolve("li_1")).toEqual({ bookId: "b-A" });
    expect(loads()).toBe(1);
  });
});
