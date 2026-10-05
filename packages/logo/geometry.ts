/**
 * The logo's geometry: a pilcrow with sound-wave arcs radiating to its right,
 * as SVG path data on a shared square viewBox. Rough drawing (tuning is later);
 * see README.md for what it means.
 */

/** Side of the square viewBox both drawings share. */
export const VIEW_BOX_SIZE = 100;

/** Sizes up to and including this many px use the small drawing. */
export const SMALL_MAX_PX = 16;

export interface DrawingPath {
  d: string;
  /** Solid shape (the pilcrow's bowl); otherwise an open stroke. */
  filled?: boolean;
}

export interface Drawing {
  /** Stroke width in viewBox units; round caps and joins. */
  strokeWidth: number;
  paths: ReadonlyArray<DrawingPath>;
}

export const drawings: Record<"small" | "regular", Drawing> = {
  /** Simplified, heavier strokes: two arcs, for 16 px and below. */
  small: {
    strokeWidth: 8,
    paths: [
      { d: "M 39 22 H 35 A 11 11 0 0 0 35 44 H 39 Z", filled: true },
      { d: "M 39 80 V 22 H 55 V 80" },
      { d: "M 65 40 A 10 10 0 0 1 65 60" },
      { d: "M 73 26 A 26 26 0 0 1 73 74" },
    ],
  },
  regular: {
    strokeWidth: 6,
    paths: [
      { d: "M 42 18 H 36 A 13 13 0 0 0 36 44 H 42 Z", filled: true },
      { d: "M 42 82 V 18 H 54 V 82" },
      { d: "M 62 41 A 12 12 0 0 1 62 59" },
      { d: "M 70 33 A 20 20 0 0 1 70 67" },
      { d: "M 78 25 A 28 28 0 0 1 78 75" },
    ],
  },
};

/** The drawing to use at a rendered size in px. */
export function drawingFor(sizePx: number): Drawing {
  return sizePx <= SMALL_MAX_PX ? drawings.small : drawings.regular;
}
