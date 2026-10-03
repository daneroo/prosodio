/**
 * Identity map (ADR-0001): audiobookshelf library item → Bookplayer book.
 * Each item's relPath is matched to the library book with the same
 * directory; the book id comes from the library, never recomputed here.
 *
 * Built on the server with the server's own API key: in the background at
 * startup (never blocking or failing it), held in memory, and rebuilt on a
 * miss at most once a minute so newly added books are found without a
 * restart.
 */
import { z } from "zod";

import { getLibrary } from "#/lib/library";
import type { AudiobookshelfConfig, BookplayerConfig } from "#/lib/config";

export interface AudiobookshelfItem {
  id: string;
  relPath: string;
  title: string;
}

export type FollowResolution =
  { bookId: string } | { unmatched: true; title: string } | { unknown: true };

export interface IdentityMapCounts {
  items: number;
  matched: number;
  unmatched: number;
  books: number;
  booksNotInAudiobookshelf: number;
}

export interface IdentityMap {
  resolve: (itemId: string) => FollowResolution;
  counts: IdentityMapCounts;
}

export function buildIdentityMap(
  items: Array<AudiobookshelfItem>,
  books: Array<{ id: string; relDir: string }>,
): IdentityMap {
  const bookByDir = new Map(books.map((b) => [dirKey(b.relDir), b.id]));
  const byItem = new Map<string, FollowResolution>();
  const matchedBooks = new Set<string>();
  let matched = 0;
  for (const item of items) {
    const bookId = bookByDir.get(dirKey(item.relPath));
    if (bookId) {
      matched += 1;
      matchedBooks.add(bookId);
      byItem.set(item.id, { bookId });
    } else {
      byItem.set(item.id, { unmatched: true, title: item.title });
    }
  }
  return {
    resolve: (itemId) => byItem.get(itemId) ?? { unknown: true },
    counts: {
      items: items.length,
      matched,
      unmatched: items.length - matched,
      books: books.length,
      booksNotInAudiobookshelf: books.length - matchedBooks.size,
    },
  };
}

/** Same directory, whatever the Unicode form or trailing slash. */
function dirKey(relPath: string): string {
  return relPath.normalize("NFC").replace(/\/+$/, "");
}

// AUDIOBOOKSHELF REST

const itemsListSchema = z.object({ results: z.array(z.unknown()) });

const itemSchema = z.object({
  id: z.string(),
  relPath: z.string(),
  media: z.object({
    metadata: z.object({ title: z.string().nullish() }),
  }),
});

/** One minified items-list response → items (title falls back to relPath).
 *  A malformed item is skipped rather than failing the whole build. */
export function parseItemsList(body: unknown): Array<AudiobookshelfItem> {
  return itemsListSchema.parse(body).results.flatMap((raw) => {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) return [];
    const r = parsed.data;
    return [
      {
        id: r.id,
        relPath: r.relPath,
        title: r.media.metadata.title || r.relPath,
      },
    ];
  });
}

const librariesSchema = z.object({
  libraries: z.array(z.object({ id: z.string(), mediaType: z.string() })),
});

/** Every item of every book-type library: one minified list call each. */
export async function fetchAudiobookshelfItems(
  config: AudiobookshelfConfig,
): Promise<Array<AudiobookshelfItem>> {
  // The configured URL is the REST base and may carry a path.
  const base = config.url.endsWith("/") ? config.url : `${config.url}/`;
  const get = async (path: string): Promise<unknown> => {
    const response = await fetch(new URL(path, base), {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    if (!response.ok) throw new Error(`GET ${path}: HTTP ${response.status}`);
    return response.json();
  };
  const { libraries } = librariesSchema.parse(await get("api/libraries"));
  const items: Array<AudiobookshelfItem> = [];
  for (const library of libraries) {
    if (library.mediaType !== "book") continue;
    const body = await get(
      `api/libraries/${encodeURIComponent(library.id)}/items?minified=1`,
    );
    items.push(...parseItemsList(body));
  }
  return items;
}

// STORE

const REBUILD_MIN_INTERVAL_MS = 60_000;

export interface IdentityMapStore {
  /** Starts the background build; returns at once. */
  start: () => void;
  /** Never throws: a failed or absent build resolves to unknown. */
  resolve: (itemId: string) => Promise<FollowResolution>;
}

export function createIdentityMapStore(options: {
  load: () => Promise<IdentityMap>;
  now?: () => number;
  log?: (message: string) => void;
}): IdentityMapStore {
  const { load, now = Date.now, log = console.log } = options;
  let map: IdentityMap | null = null;
  let building: Promise<void> | null = null;
  let lastBuildAt = Number.NEGATIVE_INFINITY;

  function build(): Promise<void> {
    lastBuildAt = now();
    const started = performance.now();
    building = load()
      .then((next) => {
        map = next;
        const c = next.counts;
        const elapsed = Math.round(performance.now() - started);
        log(
          `[identity-map] items=${c.items} matched=${c.matched} unmatched=${c.unmatched} books=${c.books} booksNotInAudiobookshelf=${c.booksNotInAudiobookshelf} in ${elapsed}ms`,
        );
      })
      .catch((error: unknown) => {
        log(`[identity-map] build failed: ${String(error)}`);
      })
      .finally(() => {
        building = null;
      });
    return building;
  }

  const lookup = (itemId: string): FollowResolution =>
    map?.resolve(itemId) ?? { unknown: true };

  return {
    start() {
      if (!building) void build();
    },
    async resolve(itemId) {
      if (building) await building;
      const found = lookup(itemId);
      if (!("unknown" in found)) return found;
      if (now() - lastBuildAt < REBUILD_MIN_INTERVAL_MS) return found;
      await build();
      return lookup(itemId);
    },
  };
}

// SINGLETON (server runtime; tests use the functions above directly)

// On globalThis for the same reason as getLibrary: the startup plugin and
// the server functions are separate module instances.
const INSTANCE = Symbol.for("bookplayer.identity-map");
const shared = globalThis as { [INSTANCE]?: IdentityMapStore };

/** null when follow mode is not configured. */
export function getIdentityMap(
  config: BookplayerConfig,
): IdentityMapStore | null {
  const audiobookshelf = config.audiobookshelf;
  if (!audiobookshelf) return null;
  shared[INSTANCE] ??= createIdentityMapStore({
    load: async () => {
      const items = await fetchAudiobookshelfItems(audiobookshelf);
      return buildIdentityMap(items, getLibrary(config).getIndex().books);
    },
  });
  return shared[INSTANCE];
}
