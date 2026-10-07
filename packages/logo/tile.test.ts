import { describe, expect, test } from "bun:test";

import { drawLogo } from "./geometry.ts";
import { FIT_DEFAULTS, placeOnTile, tileStyle } from "./tile.ts";

/** Expected values are the Claude Design source's own output (`mk()` and
 * `tile()` run verbatim). */
describe("placeOnTile", () => {
  test("defaults: the settled fit", () => {
    expect(FIT_DEFAULTS).toEqual({ fill: 58, opticalX: 1, opticalY: 1.5 });
  });

  test("the settled placement", () => {
    const placement = placeOnTile(drawLogo());
    expect(placement.transform).toBe("translate(22 33.38) scale(0.6715)");
    expect(placement.scale).toBeCloseTo(0.6714686356945827, 10);
    expect(placement.x).toBeCloseTo(22, 10);
    expect(placement.y).toBeCloseTo(33.37556852260926, 10);
  });

  test("opticalY moves the logo down the tile (S6)", () => {
    expect(placeOnTile(drawLogo(), { opticalY: 0 }).transform).toBe(
      "translate(22 31.88) scale(0.6715)",
    );
  });

  test("placement follows the drawing's box", () => {
    expect(placeOnTile(drawLogo({ arcCount: 2 })).transform).toBe(
      "translate(22 27.92) scale(0.7861)",
    );
    expect(placeOnTile(drawLogo({ arcGap: 8 })).transform).toBe(
      "translate(22 33.98) scale(0.6489)",
    );
    expect(placeOnTile(drawLogo({ arcHeight: 0 })).transform).toBe(
      "translate(22 31.36) scale(0.6715)",
    );
  });

  test("the small variant's fit", () => {
    expect(
      placeOnTile(drawLogo({ arcCount: 2, arcWeight: 0.95 }), { fill: 64 })
        .transform,
    ).toBe("translate(19 26.72) scale(0.8259)");
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
