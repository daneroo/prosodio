import { describe, expect, test } from "bun:test";

import { bareViewBox, drawLogo } from "./geometry.ts";
import { placeOnTile } from "./tile.ts";
import {
  SMALL_LOGO_MAX_PX,
  logoFor,
  logoSizeOnTile,
  tileLogoFor,
} from "./sizing.ts";

describe("logoFor (bare: px is the logo size)", () => {
  test("at or below the threshold is small, above it regular", () => {
    expect(logoFor(SMALL_LOGO_MAX_PX).variant).toBe("small");
    expect(logoFor(SMALL_LOGO_MAX_PX - 1).variant).toBe("small");
    expect(logoFor(SMALL_LOGO_MAX_PX + 1).variant).toBe("regular");
  });

  test("regular: the settled drawing", () => {
    const { logo, viewBox } = logoFor(64);
    expect(logo).toEqual(drawLogo());
    expect(viewBox).toBe("-0.5 -6.02 87.38 66.02");
  });

  test("small: 2 heavier arcs (the design's small())", () => {
    const { logo, viewBox } = logoFor(SMALL_LOGO_MAX_PX);
    expect(logo.arcs).toBe(
      "M55.27 16.31A9 9 0 0 1 55.27 29.69M65.29 5.19A23.96 23.96 0 0 1 65.29 40.81",
    );
    expect(logo.arcStroke).toBe(8.55);
    expect(viewBox).toBe(bareViewBox(logo));
  });

  test("each variant is drawn once", () => {
    expect(logoFor(16)).toBe(logoFor(24));
    expect(logoFor(32)).toBe(logoFor(128));
  });
});

describe("logoSizeOnTile", () => {
  test("bare at that size, the logo is drawn at the same scale as on the tile", () => {
    const { logo } = logoFor(Infinity);
    const frameWidth = logo.box.right - logo.box.left + 1; // bareViewBox's width
    for (const tile of [16, 32, 48, 128]) {
      const onTile = (tile / 100) * placeOnTile(logo).scale; // px per u
      const bare = logoSizeOnTile(tile) / frameWidth; // px per u
      expect(bare).toBeCloseTo(onTile, 10);
    }
  });
});

describe("tileLogoFor (px is the tile size)", () => {
  test("the variant follows the logo size on the tile, not the tile size", () => {
    for (let tile = 8; tile <= 128; tile++) {
      const small = logoSizeOnTile(tile) <= SMALL_LOGO_MAX_PX;
      expect(tileLogoFor(tile).variant).toBe(small ? "small" : "regular");
    }
  });

  test("a 32 px tile draws the small variant, a bare 32 px logo does not", () => {
    expect(tileLogoFor(32).variant).toBe("small");
    expect(logoFor(32).variant).toBe("regular");
  });
});
