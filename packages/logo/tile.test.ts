import { describe, expect, test } from "bun:test";

import { drawLogo } from "./geometry.ts";
import { LOGO_WIDTH_ON_TILE_RATIO } from "./sizing.ts";
import { FIT_DEFAULTS, placeOnTile, tileStyle } from "./tile.ts";

/** placeOnTile is tested by its rules, so tuning LOGO_WIDTH_ON_TILE_RATIO
 * needs no test edits; tileStyle is pinned to the Claude Design source's
 * own `tile()` output. */
describe("placeOnTile", () => {
  test("defaults: the settled optical offset", () => {
    expect(FIT_DEFAULTS).toEqual({ opticalX: 1, opticalY: 1.5 });
  });

  // Any drawing: its box is LOGO_WIDTH_ON_TILE_RATIO of the tile wide,
  // centred, then moved by the optical offset. True whatever the ratio is
  // tuned to.
  const drawings = [
    drawLogo(),
    drawLogo({ arcCount: 2, arcWeight: 0.95 }),
    drawLogo({ arcGap: 8 }),
    drawLogo({ arcHeight: 0 }),
  ];

  test("the logo's box spans the logo width on a tile", () => {
    for (const logo of drawings) {
      const { scale } = placeOnTile(logo);
      const width = logo.box.right - logo.box.left;
      expect(scale * width).toBeCloseTo(LOGO_WIDTH_ON_TILE_RATIO * 100, 10);
    }
  });

  test("the box is centred, then moved by the optical offset", () => {
    for (const logo of drawings) {
      const { scale, x, y } = placeOnTile(logo);
      const { left, top, right, bottom } = logo.box;
      expect(x + (scale * (left + right)) / 2).toBeCloseTo(50 + 1, 10);
      expect(y + (scale * (top + bottom)) / 2).toBeCloseTo(50 + 1.5, 10);
    }
  });

  test("opticalY moves the logo down the tile, nothing else (S6)", () => {
    const settled = placeOnTile(drawLogo());
    const raised = placeOnTile(drawLogo(), { opticalY: 0 });
    expect(raised.scale).toBe(settled.scale);
    expect(raised.x).toBe(settled.x);
    expect(settled.y - raised.y).toBeCloseTo(1.5, 10);
  });

  test("the transform is the placement, rounded", () => {
    const { scale, x, y, transform } = placeOnTile(drawLogo());
    expect(transform).toBe(
      `translate(${+x.toFixed(2)} ${+y.toFixed(2)}) scale(${+scale.toFixed(4)})`,
    );
  });
});

describe("tileStyle", () => {
  test("the chosen tile: flat sepia on cream, 22.5% corners", () => {
    expect(tileStyle(84)).toEqual({
      radius: 18.9,
      background: "#fffbeb",
      color: "#461901",
      shadow:
        "0 1px 1.68px rgba(0,0,0,.1), 0 5.04px 13.44px -5.04px rgba(70,25,1,.22), 0 0 0 1px rgba(70,25,1,.14)",
    });
    expect(tileStyle(24)).toEqual({
      radius: 5.4,
      background: "#fffbeb",
      color: "#461901",
      shadow:
        "0 1px 1px rgba(0,0,0,.1), 0 1.44px 3.84px -1.44px rgba(70,25,1,.22), 0 0 0 1px rgba(70,25,1,.14)",
    });
  });
});
