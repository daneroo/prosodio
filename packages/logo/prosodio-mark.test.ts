import { describe, expect, test } from "bun:test";

import { renderVals } from "./prosodio-mark.ts";

/**
 * Every expected value here is the Claude Design source's own output
 * (`Prosodio Mark.dc.html` `renderVals`, run verbatim with its Tweaks at
 * their defaults): the port must match it exactly.
 */
const pil = "M16 0H46V60H37V9H31V60H22V32H16A16 16 0 0 1 16 0Z";

describe("mk", () => {
  const { mk } = renderVals();

  test("defaults: the settled construction", () => {
    expect(mk()).toMatchObject({
      pil,
      waves:
        "M54.6 16.31A9 9 0 0 1 54.6 29.69M63.03 6.95A21.6 21.6 0 0 1 63.03 39.05M71.46 -2.42A34.2 34.2 0 0 1 71.46 48.42",
      sw: 7.2,
      tf: "translate(22 33.38) scale(0.6715)",
      vb: "-0.5 -6.02 87.38 66.02",
    });
  });

  test("studies move only what they vary (S1 lift, S2 gap)", () => {
    expect(mk({ lift: 0 })).toMatchObject({
      pil,
      waves:
        "M54.6 23.31A9 9 0 0 1 54.6 36.69M63.03 13.95A21.6 21.6 0 0 1 63.03 46.05M71.46 4.58A34.2 34.2 0 0 1 71.46 55.42",
      tf: "translate(22 31.36) scale(0.6715)",
      vb: "-0.5 0 87.38 60",
    });
    expect(mk({ gap: 8 })).toMatchObject({
      pil,
      tf: "translate(22 33.98) scale(0.6489)",
      vb: "-0.5 -6.02 90.38 66.02",
    });
  });
});

describe("small", () => {
  const { small, mk } = renderVals();

  test("≤24px: two heavier arcs, filling more of the tile", () => {
    expect(small(24)).toMatchObject({
      pil,
      waves:
        "M55.27 16.31A9 9 0 0 1 55.27 29.69M65.29 5.19A23.96 23.96 0 0 1 65.29 40.81",
      sw: 8.55,
      tf: "translate(19 26.72) scale(0.8259)",
      vb: "-0.5 0 78.49 60",
    });
    expect(small(16)).toEqual(small(24));
  });

  test(">24px is the regular drawing", () => {
    expect(small(25)).toEqual(mk());
  });
});

describe("tile", () => {
  const { tile, M } = renderVals();

  test("flat sepia on cream at 24px: no inner light, no logo filter", () => {
    expect(tile(M, 24, "paper", {}, "flat")).toMatchObject({
      rad: 5.4,
      bg: "#fffbeb",
      fg: "#461901",
      shadow:
        "0 1px 1px rgba(0,0,0,.1), 0 1.44px 3.84px -1.44px rgba(70,25,1,.22), 0 0 0 1px rgba(70,25,1,.14)",
      mf: "none",
    });
  });

  test("the finish Tweak defaults to Flat", () => {
    expect(tile(M, 24)).toEqual(tile(M, 24, "paper", {}, "flat"));
    const glass = renderVals({ finish: "Glass" });
    expect(glass.tile(M, 64)).toEqual(glass.tile(M, 64, "paper", {}, "glass"));
  });

  test("sheen on a dark scheme: oklch light falloff, inner light", () => {
    expect(tile(M, 32, "sepia", {}, "sheen")).toMatchObject({
      rad: 7.2,
      bg: "radial-gradient(140% 110% at 22% 0%, oklch(0.36 0.08 45) 0%, oklch(0.29 0.08 45) 50%, oklch(0.23 0.08 45) 100%)",
      fg: "#fffbeb",
      shadow:
        "0 1px 1px rgba(0,0,0,.1), 0 1.92px 5.12px -1.92px rgba(50,18,0,.4), inset 0 0.5px 0 rgba(255,255,255,0.28), inset 0 -0.5px 0.96px rgba(0,0,0,0.22)",
      mf: "drop-shadow(0 0.26px 0.32px rgba(0,0,0,.3))",
    });
  });

  test("glass adds a specular band over the sheen", () => {
    expect(tile(M, 112, "midnight", {}, "glass")).toMatchObject({
      rad: 25.2,
      bg: "linear-gradient(172deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.07) 46%, rgba(255,255,255,0) 47%), radial-gradient(140% 110% at 22% 0%, oklch(0.39 0.07 262) 0%, oklch(0.32 0.07 262) 50%, oklch(0.26 0.07 262) 100%)",
      fg: "oklch(0.74 0.13 58)",
      shadow:
        "0 1.12px 2.24px rgba(0,0,0,.1), 0 6.72px 17.92px -6.72px rgba(10,20,50,.4), inset 0 0.9px 0 rgba(255,255,255,0.28), inset 0 -1.34px 3.36px rgba(0,0,0,0.22)",
      mf: "drop-shadow(0 0.9px 1.12px rgba(0,0,0,.3))",
    });
    expect(tile(M, 128, "paper", {}, "glass")).toMatchObject({
      rad: 28.8,
      bg: "linear-gradient(172deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.25) 46%, rgba(255,255,255,0) 47%), radial-gradient(140% 110% at 22% 0%, oklch(0.997 0.025 95) 0%, oklch(0.985 0.025 95) 50%, oklch(0.94 0.025 95) 100%)",
      fg: "#461901",
      shadow:
        "0 1.28px 2.56px rgba(0,0,0,.1), 0 7.68px 20.48px -7.68px rgba(70,25,1,.22), 0 0 0 1px rgba(70,25,1,.14), inset 0 1.02px 0 rgba(255,255,255,0.9), inset 0 -1.54px 3.84px rgba(0,0,0,0.06)",
      mf: "drop-shadow(0 1.02px 0 rgba(255,255,255,.9))",
    });
  });
});
