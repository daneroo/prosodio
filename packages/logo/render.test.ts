import { describe, expect, test } from "bun:test";

import {
  DEFAULT_TILE_PARAMS,
  drawings,
  renderLogo,
  renderTile,
} from "./index.ts";

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

  test("≤16 px selects the small drawing, larger the regular one", () => {
    const small = drawings.small.paths[0]!.d;
    const regular = drawings.regular.paths[0]!.d;
    expect(renderLogo(16)).toContain(small);
    expect(renderLogo(8)).toContain(small);
    expect(renderLogo(17)).toContain(regular);
    expect(renderLogo(128)).toContain(regular);
    expect(renderLogo(16)).not.toBe(renderLogo(17));
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
    expect(rect!.fill).toBe(DEFAULT_TILE_PARAMS.background);
    expect(rect!["fill-opacity"]).toBeUndefined();
    expect(rect!.opacity).toBeUndefined();
  });

  test("favicon tile has rounded corners", () => {
    const rect = firstRect(renderTile(32, "favicon"));
    expect(rect).toBeDefined();
    expect(Number(rect!.rx)).toBeGreaterThan(0);
    expect(Number(rect!.ry)).toBeGreaterThan(0);
  });

  test("tile draws the logo in the params color, not currentColor", () => {
    const svg = renderTile(32, "favicon");
    expect(svg).toContain(DEFAULT_TILE_PARAMS.color);
    expect(svg).not.toContain("currentColor");
  });

  test("at 16 px the tile uses the small drawing", () => {
    expect(renderTile(16, "favicon")).toContain(drawings.small.paths[0]!.d);
    expect(renderTile(32, "favicon")).toContain(drawings.regular.paths[0]!.d);
  });

  test("is deterministic", () => {
    expect(renderTile(180, "home-screen")).toBe(renderTile(180, "home-screen"));
  });
});
