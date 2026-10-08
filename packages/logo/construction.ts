/**
 * The detailed API: the logo's construction, every variable exposed. For
 * the lab's boards (Board 0 · Construction, Board 1 · Studies) and this
 * package's internals only. Normal use is `@prosodio/logo`, where only the
 * variant (regular or small) changes.
 */
export {
  ARC,
  LOGO_DEFAULTS,
  PILCROW,
  bareFrame,
  drawLogo,
  round,
} from "./geometry.ts";
export type { Logo, LogoParams } from "./geometry.ts";
export {
  LOGO_WIDTH_ON_TILE_RATIO,
  SMALL_LOGO_MAX_PX,
  logoSizeOnTile,
} from "./sizing.ts";
export { FIT_DEFAULTS, TILE_SIZE, placeOnTile } from "./tile.ts";
export type { TileFit, TilePlacement } from "./tile.ts";
