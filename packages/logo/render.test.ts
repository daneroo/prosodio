import { describe, expect, test } from "bun:test";

import {
  logoFor,
  renderLogo,
  renderTile,
  tileLogoFor,
  tileStyle,
} from "./index.ts";
import {
  SAFE_ZONE_RADIUS,
  TILE_SIZE,
  placeInSafeZone,
  placeOnTile,
} from "./construction.ts";

/** Attributes of the first <rect> in an SVG string, or undefined. */
function firstRect(svg: string): Record<string, string> | undefined {
  const tag = svg.match(/<rect\b[^>]*>/)?.[0];
  if (!tag) return undefined;
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]),
  );
}

describe("renderLogo", () => {
  test("is one color (currentColor) with no background", () => {
    const svg = renderLogo(64);
    expect(svg).toContain("currentColor");
    expect(svg).not.toContain("<rect");
    expect(svg).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  test("draws logoFor's variant at each size", () => {
    for (const size of [8, 16, 24, 25, 32, 128]) {
      expect(renderLogo(size)).toContain(logoFor(size).logo.arcs);
    }
  });

  test("bare, the drawing sits in its own bounding box", () => {
    expect(renderLogo(64)).toContain(`viewBox="${logoFor(64).viewBox}"`);
  });

  test("is deterministic", () => {
    expect(renderLogo(32)).toBe(renderLogo(32));
  });
});

describe("renderTile", () => {
  test("home-screen tile is opaque and full-bleed", () => {
    const rect = firstRect(renderTile(180, "home-screen"));
    expect(rect).toBeDefined();
    expect(rect!.x ?? "0").toBe("0");
    expect(rect!.y ?? "0").toBe("0");
    expect(rect!.width).toBe("100");
    expect(rect!.height).toBe("100");
    expect(rect!.rx).toBeUndefined();
    expect(rect!.ry).toBeUndefined();
    expect(rect!.fill).toBe(tileStyle(180).background);
    expect(rect!["fill-opacity"]).toBeUndefined();
    expect(rect!.opacity).toBeUndefined();
  });

  test("favicon tile has the source's 22.5% corners", () => {
    const rect = firstRect(renderTile(32, "favicon"));
    expect(rect).toBeDefined();
    expect(Number(rect!.rx)).toBeCloseTo(22.5);
    expect(Number(rect!.ry)).toBeCloseTo(22.5);
  });

  test("tile draws the logo in the tile's color, not currentColor", () => {
    const svg = renderTile(32, "favicon");
    expect(svg).toContain(`fill="${tileStyle(32).color}"`);
    expect(svg).not.toContain("currentColor");
  });

  test("the tile places the drawing with its tile transform", () => {
    for (const size of [32, 48]) {
      const { logo } = tileLogoFor(size);
      expect(renderTile(size, "favicon")).toContain(
        `transform="${placeOnTile(logo).transform}"`,
      );
    }
    expect(renderTile(32, "favicon")).toContain(tileLogoFor(32).logo.arcs);
    expect(tileLogoFor(32).variant).toBe("small");
  });

  test("maskable tile is opaque and full-bleed", () => {
    const rect = firstRect(renderTile(512, "maskable"));
    expect(rect).toBeDefined();
    expect(rect!.width).toBe("100");
    expect(rect!.height).toBe("100");
    expect(rect!.rx).toBeUndefined();
    expect(rect!.fill).toBe(tileStyle(512).background);
  });

  test("maskable tile keeps the logo's box inside the safe zone", () => {
    const { logo } = tileLogoFor(512);
    const { scale, x, y, transform } = placeInSafeZone(logo);
    const { left, top, right, bottom } = logo.box;
    const corners = [
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom],
    ].map(([u, v]) =>
      Math.hypot(
        x + scale * u! - TILE_SIZE / 2,
        y + scale * v! - TILE_SIZE / 2,
      ),
    );
    expect(Math.max(...corners)).toBeCloseTo(SAFE_ZONE_RADIUS, 6);
    expect(renderTile(512, "maskable")).toContain(`transform="${transform}"`);
  });

  test("is deterministic", () => {
    expect(renderTile(180, "home-screen")).toBe(renderTile(180, "home-screen"));
  });
});
