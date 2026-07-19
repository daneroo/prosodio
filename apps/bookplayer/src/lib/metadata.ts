/**
 * Book metadata extraction (docs/corpora/metadata.md): m4b ffprobe tags are
 * the canonical source; the directory basename is only a fallback for when
 * the title tag is absent. Pure — no I/O, so the decision is testable
 * without touching a filesystem or spawning ffprobe.
 */
import type { ProbeResult } from "./ffprobe.ts";
import { parseBasename } from "./scan.ts";
import type { BookSeries } from "./types.ts";

/** Trailing ` #<position>` on a grouping part, integer or fractional
 *  (e.g. "Discworld #34", "Novella #3.5"). Greedy so a colon-bearing name
 *  ("Discworld: Ankh-Morpork City Watch #7") stays intact. */
const SERIES_POSITION_RE = /^(.*)\s#(\d+(?:\.\d+)?)$/;

/**
 * The `grouping` tag holds semicolon-separated series memberships (a book
 * can belong to more than one), each `<name> #<position>` with the position
 * optional. Junk values with no series shape (e.g. a stray genre "Adult")
 * parse as name-only entries — acceptable noise, surfaced elsewhere.
 */
export function parseGrouping(grouping: string | null): Array<BookSeries> {
  if (!grouping) return [];
  return grouping
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const match = SERIES_POSITION_RE.exec(part);
      if (!match) return { name: part, position: null };
      const [, name, position] = match;
      return {
        name: (name ?? part).trim(),
        position: Number.parseFloat(position ?? ""),
      };
    });
}

/**
 * D1: when the title tag is present, title/author come from the tags —
 * the basename never backfills author, even if the tag left it null. When
 * the title tag is absent, both fall back to the basename parse and
 * `usedBasenameFallback` records that the defect happened.
 */
export function extractMetadata(
  probe: ProbeResult,
  basename: string,
): {
  title: string;
  author: string | null;
  series: Array<BookSeries>;
  narrator: string | null;
  usedBasenameFallback: boolean;
} {
  const series = parseGrouping(probe.groupingTag);
  const narrator = probe.composerTag;
  if (probe.titleTag) {
    return {
      title: probe.titleTag,
      author: probe.artistTag,
      series,
      narrator,
      usedBasenameFallback: false,
    };
  }
  const { author, title } = parseBasename(basename);
  return { title, author, series, narrator, usedBasenameFallback: true };
}
