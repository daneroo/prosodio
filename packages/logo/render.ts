import { VIEW_BOX_SIZE, drawingFor } from "./geometry.ts";
import type { Drawing } from "./geometry.ts";
import { renderVals } from "./prosodio-mark.ts";
import type { SchemeKey } from "./prosodio-mark.ts";

/**
 * Which tile: `favicon` has rounded corners (transparent only there);
 * `home-screen` is an opaque full-bleed square, because iPadOS applies its
 * own mask and renders transparent pixels as black.
 */
export type TileShape = "favicon" | "home-screen";

const { tile } = renderVals();

/** The bare logo: `currentColor` on a transparent background, in its own
 * bounding box (`vb`), centered in a `sizePx` square. */
export function renderLogo(sizePx: number): string {
  const drawing = drawingFor(sizePx);
  return svg(sizePx, drawing.vb, drawingMarkup(drawing, "currentColor"));
}

/**
 * The logo on its own opaque square background: the source's flat tile
 * (background, logo color, `tf` placement, `rad` corners). Its CSS shadows
 * and edge are page effects, not part of an icon, so they are left out.
 */
export function renderTile(
  sizePx: number,
  shape: TileShape,
  scheme: SchemeKey = "paper",
): string {
  const drawing = drawingFor(sizePx);
  const { bg, fg, rad } = tile(drawing, sizePx, scheme, {}, "flat");
  const radius = (rad / sizePx) * VIEW_BOX_SIZE;
  const corners = shape === "favicon" ? ` rx="${radius}" ry="${radius}"` : "";
  const background = `<rect width="${VIEW_BOX_SIZE}" height="${VIEW_BOX_SIZE}"${corners} fill="${bg}"/>`;
  const logo = `<g transform="${drawing.tf}">${drawingMarkup(drawing, fg)}</g>`;
  return svg(
    sizePx,
    `0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`,
    background + logo,
  );
}

function drawingMarkup(drawing: Drawing, color: string): string {
  return `<path d="${drawing.pil}" fill="${color}"/><path d="${drawing.waves}" fill="none" stroke="${color}" stroke-width="${drawing.sw}" stroke-linecap="round"/>`;
}

function svg(sizePx: number, viewBox: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${sizePx}" height="${sizePx}">${body}</svg>`;
}
