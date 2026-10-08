/**
 * The tile: the logo on its own square background, drawn on a 100×100
 * viewBox. Settled in Claude Design (`Prosodio Mark.dc.html`); its names in
 * brackets. The tests pin this to that source's own output.
 */
import { round } from "./geometry.ts";
import type { Logo } from "./geometry.ts";
import { TILE_FINISH, TILE_SCHEME, TILE_SCHEMES } from "./colors.ts";
import type { TileFinish, TileScheme, TileSchemeKey } from "./colors.ts";
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
  /** CSS box-shadow: a soft drop shadow, the edge if any, the finish's
   * inner light. */
  shadow: string;
  /** CSS filter on the logo: a faint drop shadow for sheen and glass from
   * 32 px up, else `none`. */
  logoFilter: string;
}

/** Corner radius, × tile size. */
const CORNER = 0.225;

/** A tile's look: `scheme` (colors.ts) with `finish`, both defaulting to
 * the chosen ones. The design's `tile()`. */
export function tileStyle(
  sizePx: number,
  scheme: TileSchemeKey = TILE_SCHEME,
  finish: TileFinish = TILE_FINISH,
): TileStyle {
  const {
    background: bg,
    logo,
    shadow,
    edge,
    light,
  } = TILE_SCHEMES[scheme] as TileScheme;
  const { L, C, H } = bg;
  const lighten = light ? 0.012 : 0.07;
  const darken = light ? 0.045 : 0.06;
  const sheen = `radial-gradient(140% 110% at 22% 0%, ${oklch(L + lighten, C, H)} 0%, ${oklch(L, C, H)} 50%, ${oklch(L - darken, C, H)} 100%)`;
  const glass = `linear-gradient(172deg, rgba(255,255,255,${light ? 0.7 : 0.26}) 0%, rgba(255,255,255,${light ? 0.25 : 0.07}) 46%, rgba(255,255,255,0) 47%), ${sheen}`;
  const background =
    finish === "flat" ? bg.flat : finish === "sheen" ? sheen : glass;

  const drop = `0 ${round(Math.max(1, sizePx * 0.01))}px ${round(Math.max(1, sizePx * 0.02))}px rgba(0,0,0,.1), 0 ${round(sizePx * 0.06)}px ${round(sizePx * 0.16)}px -${round(sizePx * 0.06)}px ${shadow}`;
  const edgeShadow = edge ? `, 0 0 0 1px ${edge}` : "";
  const innerLight =
    finish === "flat"
      ? ""
      : `, inset 0 ${round(Math.max(0.5, sizePx * 0.008))}px 0 rgba(255,255,255,${light ? 0.9 : 0.28}), inset 0 -${round(Math.max(0.5, sizePx * 0.012))}px ${round(sizePx * 0.03)}px rgba(0,0,0,${light ? 0.06 : 0.22})`;
  const logoFilter =
    finish === "flat" || sizePx < 32
      ? "none"
      : light
        ? `drop-shadow(0 ${round(sizePx * 0.008)}px 0 rgba(255,255,255,.9))`
        : `drop-shadow(0 ${round(sizePx * 0.008)}px ${round(sizePx * 0.01)}px rgba(0,0,0,.3))`;

  return {
    radius: round(sizePx * CORNER),
    background,
    color: logo,
    shadow: drop + edgeShadow + innerLight,
    logoFilter,
  };
}

/** An oklch color, lightness clamped to 0–1. */
function oklch(L: number, C: number, H: number): string {
  return `oklch(${round(Math.min(1, Math.max(0, L)), 3)} ${C} ${H})`;
}
