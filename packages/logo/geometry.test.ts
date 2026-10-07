import { describe, expect, test } from "bun:test";

import { LOGO_DEFAULTS, PILCROW, drawLogo } from "./geometry.ts";

/**
 * Expected values are the Claude Design source's own output (`Prosodio
 * Mark.dc.html`, its `mk()` run verbatim): the rewrite must draw exactly what
 * was approved there.
 */
const pilcrow = "M16 0H46V60H37V9H31V60H22V32H16A16 16 0 0 1 16 0Z";

describe("PILCROW", () => {
  test("the locked construction (turn 4)", () => {
    expect(PILCROW).toEqual({
      height: 60,
      stem: 9,
      bowl: 32,
      bowlNeck: 6,
      stemGap: 6,
    });
  });
});

describe("drawLogo", () => {
  test("defaults: the settled values", () => {
    expect(LOGO_DEFAULTS).toEqual({
      arcCount: 3,
      arcHeight: 0.5,
      arcGap: 5,
      arcWeight: 0.8,
      arcSweep: 48,
    });
  });

  test("the settled drawing", () => {
    const logo = drawLogo();
    expect(logo.pilcrow).toBe(pilcrow);
    expect(logo.arcs).toBe(
      "M54.6 16.31A9 9 0 0 1 54.6 29.69M63.03 6.95A21.6 21.6 0 0 1 63.03 39.05M71.46 -2.42A34.2 34.2 0 0 1 71.46 48.42",
    );
    expect(logo.arcCount).toBe(3);
    expect(logo.arcStroke).toBe(7.2);
    expect(logo.arcCenter.x).toBeCloseTo(48.57782454277028, 10);
    expect(logo.arcCenter.y).toBe(23);
    expect(logo.box.left).toBe(0);
    expect(logo.box.right).toBeCloseTo(86.37782454277027, 10);
    expect(logo.box.top).toBeCloseTo(-6.015553031326887, 10);
    expect(logo.box.bottom).toBe(60);
  });

  test("arcHeight: 0 centres the arcs on the stem midpoint (S1)", () => {
    const logo = drawLogo({ arcHeight: 0 });
    expect(logo.pilcrow).toBe(pilcrow);
    expect(logo.arcCenter.y).toBe(30);
    expect(logo.arcs).toBe(
      "M54.6 23.31A9 9 0 0 1 54.6 36.69M63.03 13.95A21.6 21.6 0 0 1 63.03 46.05M71.46 4.58A34.2 34.2 0 0 1 71.46 55.42",
    );
  });

  test("arcCount: 2 drops the outer arc (S4)", () => {
    const logo = drawLogo({ arcCount: 2 });
    expect(logo.arcs).toBe(
      "M54.6 16.31A9 9 0 0 1 54.6 29.69M63.03 6.95A21.6 21.6 0 0 1 63.03 39.05",
    );
    expect(logo.box.top).toBe(0);
    expect(logo.box.right).toBeCloseTo(73.77782454277028, 10);
  });

  test("arcWeight and arcSweep (S3, S5)", () => {
    expect(drawLogo({ arcWeight: 1 }).arcs).toBe(
      "M55.5 16.31A9 9 0 0 1 55.5 29.69M66.04 4.61A24.75 24.75 0 0 1 66.04 41.39M76.58 -7.1A40.5 40.5 0 0 1 76.58 53.1",
    );
    expect(drawLogo({ arcSweep: 60 }).arcs).toBe(
      "M54.6 15.21A9 9 0 0 1 54.6 30.79M60.9 4.29A21.6 21.6 0 0 1 60.9 41.71M67.2 -6.62A34.2 34.2 0 0 1 67.2 52.62",
    );
  });

  test("the small variant's values (2 heavier arcs)", () => {
    const logo = drawLogo({ arcCount: 2, arcWeight: 0.95 });
    expect(logo.arcs).toBe(
      "M55.27 16.31A9 9 0 0 1 55.27 29.69M65.29 5.19A23.96 23.96 0 0 1 65.29 40.81",
    );
    expect(logo.arcStroke).toBe(8.55);
  });

  test("arcGap moves only the arcs (S2)", () => {
    const logo = drawLogo({ arcGap: 8 });
    expect(logo.pilcrow).toBe(pilcrow);
    expect(logo.arcs).toBe(
      "M57.6 16.31A9 9 0 0 1 57.6 29.69M66.03 6.95A21.6 21.6 0 0 1 66.03 39.05M74.46 -2.42A34.2 34.2 0 0 1 74.46 48.42",
    );
  });
});
