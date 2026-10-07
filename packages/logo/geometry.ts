/**
 * The logo's geometry: a pilcrow with sound-wave arcs radiating to its right,
 * as SVG path data in construction units (u: cap height 60u, stem 9u). Built
 * by the Claude Design source's generator (`prosodio-mark.ts`) with its
 * Tweaks at their defaults; see README.md for what it means.
 */
import { renderVals } from "./prosodio-mark.ts";
import type { Mk } from "./prosodio-mark.ts";

/**
 * One drawing (the source's `mk()` result). `pil` is filled, `waves` is
 * stroked (`sw` wide, round caps). Bare, it uses `vb`, its own bounding box;
 * on a tile, the 100×100 viewBox with `tf`.
 */
export type Drawing = Mk;

/** Side of the square tile viewBox (the source's `viewBox="0 0 100 100"`). */
export const VIEW_BOX_SIZE = 100;

/** Sizes up to and including this many px use the small drawing (the
 * source's `small()`). */
export const SMALL_MAX_PX = 24;

const { small } = renderVals();

export const drawings: Record<"small" | "regular", Drawing> = {
  /** Two heavier arcs, filling more of the tile: 24 px and below. */
  small: small(SMALL_MAX_PX),
  regular: small(SMALL_MAX_PX + 1),
};

/** The drawing to use at a rendered size in px. */
export function drawingFor(sizePx: number): Drawing {
  return sizePx <= SMALL_MAX_PX ? drawings.small : drawings.regular;
}
