import type { Logo } from "./geometry.ts";
import { TILE_SIZE, placeOnTile, tileStyle } from "./tile.ts";
import { logoFor, tileLogoFor } from "./sizing.ts";

/**
 * Which tile: `favicon` has rounded corners (transparent only there);
 * `home-screen` is an opaque full-bleed square, because iPadOS applies its
 * own mask and renders transparent pixels as black.
 */
export type TileShape = "favicon" | "home-screen";

/** The bare logo: `currentColor` on a transparent background, in its own
 * frame, centered in a `sizePx` square. */
export function renderLogo(sizePx: number): string {
  const { logo, viewBox } = logoFor(sizePx);
  return svg(sizePx, viewBox, logoMarkup(logo, "currentColor"));
}

/**
 * The logo on its own opaque square background: the chosen tile
 * (`tileStyle`), the logo placed by `placeOnTile`. Its CSS shadows and edge
 * are page effects, not part of an icon, so they are left out.
 */
export function renderTile(sizePx: number, shape: TileShape): string {
  const { logo } = tileLogoFor(sizePx);
  const { background, color, radius } = tileStyle(sizePx);
  const corner = (radius / sizePx) * TILE_SIZE;
  const corners = shape === "favicon" ? ` rx="${corner}" ry="${corner}"` : "";
  const rect = `<rect width="${TILE_SIZE}" height="${TILE_SIZE}"${corners} fill="${background}"/>`;
  const placed = `<g transform="${placeOnTile(logo).transform}">${logoMarkup(logo, color)}</g>`;
  return svg(sizePx, `0 0 ${TILE_SIZE} ${TILE_SIZE}`, rect + placed);
}

function logoMarkup(logo: Logo, color: string): string {
  return `<path d="${logo.pilcrow}" fill="${color}"/><path d="${logo.arcs}" fill="none" stroke="${color}" stroke-width="${logo.arcStroke}" stroke-linecap="round"/>`;
}

function svg(sizePx: number, viewBox: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${sizePx}" height="${sizePx}">${body}</svg>`;
}
