import { describe, expect, test } from "bun:test";

import { drawLogo } from "./geometry.ts";
import { LOGO_WIDTH_ON_TILE_RATIO } from "./sizing.ts";
import { TILE_FINISH, TILE_SCHEME } from "./colors.ts";
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
    expect([TILE_SCHEME, TILE_FINISH]).toEqual(["sepiaOnCream", "flat"]);
    expect(tileStyle(84)).toEqual({
      radius: 18.9,
      background: "#fffbeb",
      color: "#461901",
      shadow:
        "0 1px 1.68px rgba(0,0,0,.1), 0 5.04px 13.44px -5.04px rgba(70,25,1,.22), 0 0 0 1px rgba(70,25,1,.14)",
      logoFilter: "none",
    });
    expect(tileStyle(24)).toEqual({
      radius: 5.4,
      background: "#fffbeb",
      color: "#461901",
      shadow:
        "0 1px 1px rgba(0,0,0,.1), 0 1.44px 3.84px -1.44px rgba(70,25,1,.22), 0 0 0 1px rgba(70,25,1,.14)",
      logoFilter: "none",
    });
  });

  test("sheen on cream on sepia: oklch light falloff, inner light", () => {
    expect(tileStyle(32, "creamOnSepia", "sheen")).toEqual({
      radius: 7.2,
      background:
        "radial-gradient(140% 110% at 22% 0%, oklch(0.36 0.08 45) 0%, oklch(0.29 0.08 45) 50%, oklch(0.23 0.08 45) 100%)",
      color: "#fffbeb",
      shadow:
        "0 1px 1px rgba(0,0,0,.1), 0 1.92px 5.12px -1.92px rgba(50,18,0,.4), inset 0 0.5px 0 rgba(255,255,255,0.28), inset 0 -0.5px 0.96px rgba(0,0,0,0.22)",
      logoFilter: "drop-shadow(0 0.26px 0.32px rgba(0,0,0,.3))",
    });
  });

  test("glass adds a specular band over the sheen", () => {
    expect(tileStyle(112, "rustOnMidnight", "glass")).toEqual({
      radius: 25.2,
      background:
        "linear-gradient(172deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.07) 46%, rgba(255,255,255,0) 47%), radial-gradient(140% 110% at 22% 0%, oklch(0.39 0.07 262) 0%, oklch(0.32 0.07 262) 50%, oklch(0.26 0.07 262) 100%)",
      color: "oklch(0.74 0.13 58)",
      shadow:
        "0 1.12px 2.24px rgba(0,0,0,.1), 0 6.72px 17.92px -6.72px rgba(10,20,50,.4), inset 0 0.9px 0 rgba(255,255,255,0.28), inset 0 -1.34px 3.36px rgba(0,0,0,0.22)",
      logoFilter: "drop-shadow(0 0.9px 1.12px rgba(0,0,0,.3))",
    });
    expect(tileStyle(128, "sepiaOnCream", "glass")).toEqual({
      radius: 28.8,
      background:
        "linear-gradient(172deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.25) 46%, rgba(255,255,255,0) 47%), radial-gradient(140% 110% at 22% 0%, oklch(0.997 0.025 95) 0%, oklch(0.985 0.025 95) 50%, oklch(0.94 0.025 95) 100%)",
      color: "#461901",
      shadow:
        "0 1.28px 2.56px rgba(0,0,0,.1), 0 7.68px 20.48px -7.68px rgba(70,25,1,.22), 0 0 0 1px rgba(70,25,1,.14), inset 0 1.02px 0 rgba(255,255,255,0.9), inset 0 -1.54px 3.84px rgba(0,0,0,0.06)",
      logoFilter: "drop-shadow(0 1.02px 0 rgba(255,255,255,.9))",
    });
  });

  test("flat midnight on rust: the oklch background, no logo filter", () => {
    const style = tileStyle(64, "midnightOnRust");
    expect(style.background).toBe("oklch(0.67 0.13 52)");
    expect(style.color).toBe("oklch(0.27 0.07 262)");
    expect(style.logoFilter).toBe("none");
  });
});
