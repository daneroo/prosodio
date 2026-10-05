import { VIEW_BOX_SIZE, drawingFor } from "./geometry.ts";
import type { Drawing } from "./geometry.ts";
import { DEFAULT_TILE_PARAMS } from "./params.ts";
import type { TileParams } from "./params.ts";

/**
 * Which tile: `favicon` has rounded corners (transparent only there);
 * `home-screen` is an opaque full-bleed square, because iPadOS applies its
 * own mask and renders transparent pixels as black.
 */
export type TileShape = "favicon" | "home-screen";

const FAVICON_CORNER_RADIUS = 22;
/** The logo's share of the tile: scaled about the center. */
const TILE_LOGO_SCALE = 0.72;

/** The bare logo: `currentColor` on a transparent background. */
export function renderLogo(sizePx: number): string {
  const body = drawingMarkup(drawingFor(sizePx), "currentColor");
  return svg(sizePx, body);
}

/** The logo on its own opaque square background. */
export function renderTile(
  sizePx: number,
  shape: TileShape,
  params: TileParams = DEFAULT_TILE_PARAMS,
): string {
  const offset = (VIEW_BOX_SIZE * (1 - TILE_LOGO_SCALE)) / 2;
  const logo = `<g transform="translate(${offset} ${offset}) scale(${TILE_LOGO_SCALE})">${drawingMarkup(drawingFor(sizePx), params.color)}</g>`;
  return svg(sizePx, tileBackground(shape, params) + logo);
}

function tileBackground(shape: TileShape, params: TileParams): string {
  const { gradient, border } = params;
  const defs = gradient
    ? `<defs><linearGradient id="tile-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${gradient.from}"/><stop offset="1" stop-color="${gradient.to}"/></linearGradient></defs>`
    : "";
  const fill = gradient ? "url(#tile-bg)" : params.background;
  const background = `<rect width="${VIEW_BOX_SIZE}" height="${VIEW_BOX_SIZE}"${corners(shape, 0)} fill="${fill}"/>`;
  if (!border) return defs + background;

  const inset = border.width / 2;
  const side = VIEW_BOX_SIZE - border.width;
  return `${defs}${background}<rect x="${inset}" y="${inset}" width="${side}" height="${side}"${corners(shape, inset)} fill="none" stroke="${border.color}" stroke-width="${border.width}"/>`;
}

/** Corner-radius attributes for a rect inset from the tile edge. */
function corners(shape: TileShape, inset: number): string {
  if (shape !== "favicon") return "";
  const radius = Math.max(0, FAVICON_CORNER_RADIUS - inset);
  return ` rx="${radius}" ry="${radius}"`;
}

function drawingMarkup(drawing: Drawing, color: string): string {
  const paths = drawing.paths
    .map(
      ({ d, filled }) => `<path d="${d}"${filled ? ` fill="${color}"` : ""}/>`,
    )
    .join("");
  return `<g fill="none" stroke="${color}" stroke-width="${drawing.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
}

function svg(sizePx: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}" width="${sizePx}" height="${sizePx}">${body}</svg>`;
}
