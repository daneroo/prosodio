/**
 * Logo sizing: which variant to draw at a size, bare or on a tile. Holds the
 * logo's two CRITICAL sizing values, tuned by experiment on the lab's
 * Board 2 (Size ladder); nothing else defines them.
 *
 * Vocabulary:
 * - logo size: the width, px, the bare logo is drawn at (its box plus the
 *   0.5u margin either side, `bareViewBox`); what `<LogoSM size>` sets.
 * - tile size: the side, px, of a tile; what `<LogoTile size>` sets.
 * - logo size on a tile: the logo size the logo inside a tile is drawn at.
 */
import type { Logo, LogoParams } from "./geometry.ts";
import { bareViewBox, drawLogo } from "./geometry.ts";

/**
 * CRITICAL, tuned on Board 2. Small-variant threshold: a logo drawn at or
 * below this logo size (px), bare or on a tile, uses the small variant.
 */
export const SMALL_LOGO_MAX_PX = 24;

/**
 * CRITICAL, tuned on Board 2. Logo width on a tile: the logo's box width ÷
 * the tile's side. Sets the tile's margin, and so the logo size on a tile.
 */
export const LOGO_WIDTH_ON_TILE_RATIO = 0.7;

type LogoVariant = "regular" | "small";

/** What each variant changes from the settled drawing. */
const VARIANTS: Record<LogoVariant, Partial<LogoParams>> = {
  regular: {},
  /** 2 heavier arcs, for small sizes. */
  small: { arcCount: 2, arcWeight: 0.95 },
};

/** One variant, drawn once. */
interface SizedLogo {
  variant: LogoVariant;
  logo: Logo;
  /** Its frame when bare. */
  viewBox: string;
}

const sized = (variant: LogoVariant): SizedLogo => {
  const logo = drawLogo(VARIANTS[variant]);
  return { variant, logo, viewBox: bareViewBox(logo) };
};

const SIZED: Record<LogoVariant, SizedLogo> = {
  regular: sized("regular"),
  small: sized("small"),
};

/** The logo to draw bare at a logo size (px). */
export function logoFor(logoSizePx: number) {
  return logoSizePx <= SMALL_LOGO_MAX_PX ? SIZED.small : SIZED.regular;
}

/**
 * The logo size (px) the logo inside a `tileSizePx` tile is drawn at: tile
 * size × logo width on a tile × (frame width ÷ box width). Measured on the
 * regular variant, so the variant being chosen cannot move its own
 * threshold.
 */
export function logoSizeOnTile(tileSizePx: number): number {
  const { left, right } = SIZED.regular.logo.box;
  const boxWidth = right - left;
  const frameWidth = boxWidth + 1;
  return tileSizePx * LOGO_WIDTH_ON_TILE_RATIO * (frameWidth / boxWidth);
}

/** The logo to draw on a tile of `tileSizePx`: decided by the logo size on
 * the tile, like any other logo. */
export function tileLogoFor(tileSizePx: number) {
  return logoFor(logoSizeOnTile(tileSizePx));
}
