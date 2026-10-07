/**
 * The tile: the logo on its own square background, drawn on a 100×100
 * viewBox. Settled in Claude Design (`Prosodio Mark.dc.html`); its names in
 * brackets. The tests pin this to that source's own output.
 */
import { round } from "./geometry.ts";
import type { Logo } from "./geometry.ts";
import { LOGO_WIDTH_ON_TILE_RATIO } from "./sizing.ts";

/** Side of the tile's viewBox. */
export const TILE_SIZE = 100;

/** The logo's optical offset on the tile, in % of the tile; its width is
 * `LOGO_WIDTH_ON_TILE_RATIO` (sizing.ts). */
export interface TileFit {
  /** Optical offset right of the geometric centre (`opticalX`). */
  opticalX: number;
  /** Optical offset down from the geometric centre (`opticalY`). */
  opticalY: number;
}

/** The settled values. */
export const FIT_DEFAULTS: TileFit = { opticalX: 1, opticalY: 1.5 };

/** The logo's placement on the tile: u → tile units is `x + scale × u`. */
export interface TilePlacement {
  scale: number;
  x: number;
  y: number;
  /** The same, as an SVG transform. */
  transform: string;
}

/** Scales the logo's box to `LOGO_WIDTH_ON_TILE_RATIO` of the tile's width,
 * centres it, then adds the optical offset (any of `fit` left out take
 * `FIT_DEFAULTS`). */
export function placeOnTile(
  logo: Logo,
  fit: Partial<TileFit> = {},
): TilePlacement {
  const { opticalX, opticalY } = { ...FIT_DEFAULTS, ...fit };
  const { left, top, right, bottom } = logo.box;
  const scale = (LOGO_WIDTH_ON_TILE_RATIO * TILE_SIZE) / (right - left);
  const x = TILE_SIZE / 2 - (scale * (left + right)) / 2 + opticalX;
  const y = TILE_SIZE / 2 - (scale * (top + bottom)) / 2 + opticalY;
  return {
    scale,
    x,
    y,
    transform: `translate(${round(x)} ${round(y)}) scale(${round(scale, 4)})`,
  };
}

/** One tile's look at `sizePx`, CSS values. */
export interface TileStyle {
  /** Corner radius, px. */
  radius: number;
  background: string;
  /** The logo's color. */
  color: string;
  /** CSS box-shadow: a soft drop shadow and a 1px edge. */
  shadow: string;
}

/** Corner radius, × tile size. */
const CORNER = 0.225;

/** The chosen tile: flat, sepia `#461901` on cream `#fffbeb` (`paper`). */
export function tileStyle(sizePx: number): TileStyle {
  const drop = `0 ${round(Math.max(1, sizePx * 0.01))}px ${round(Math.max(1, sizePx * 0.02))}px rgba(0,0,0,.1), 0 ${round(sizePx * 0.06)}px ${round(sizePx * 0.16)}px -${round(sizePx * 0.06)}px rgba(70,25,1,.22)`;
  return {
    radius: round(sizePx * CORNER),
    background: "#fffbeb",
    color: "#461901",
    shadow: `${drop}, 0 0 0 1px rgba(70,25,1,.14)`,
  };
}
