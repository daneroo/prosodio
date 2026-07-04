/**
 * Landing-page browse logic, kept out of the route file so the seed's
 * filter truth table and sort orders are unit-testable.
 */
export interface BrowseRow {
  title: string;
  author: string | null;
  durationSec: number | null;
  hasEpub: boolean;
  hasVtt: boolean;
}

export interface CapabilityFilters {
  epub: boolean;
  vtt: boolean;
}

/** Seed truth table: both on = EPUB∧VTT; one on = that one; both off = all. */
export function applyFilters<T extends BrowseRow>(
  books: Array<T>,
  filters: CapabilityFilters,
): Array<T> {
  if (filters.epub && filters.vtt) {
    return books.filter((b) => b.hasEpub && b.hasVtt);
  }
  if (filters.epub) return books.filter((b) => b.hasEpub);
  if (filters.vtt) return books.filter((b) => b.hasVtt);
  return books;
}

export type SortKey = "title" | "author" | "duration";

export function compareBy<T extends BrowseRow>(
  sort: SortKey,
): (a: T, b: T) => number {
  return (a, b) => {
    switch (sort) {
      case "title":
        return a.title.localeCompare(b.title);
      case "author":
        // Authorless rows sort last (U+FFFF sentinel).
        return (a.author ?? "￿").localeCompare(b.author ?? "￿");
      case "duration":
        return (b.durationSec ?? -1) - (a.durationSec ?? -1);
    }
  };
}

export function searchRows<T extends BrowseRow>(
  books: Array<T>,
  query: string,
): Array<T> {
  const q = query.trim().toLowerCase();
  if (!q) return books;
  return books.filter(
    (b) =>
      b.title.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q),
  );
}

export function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
