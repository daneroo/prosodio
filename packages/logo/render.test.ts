import { describe, expect, test } from "bun:test";

import { S, drawings, renderLogo, renderTile } from "./index.ts";

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

  test("≤24 px selects the small drawing, larger the regular one", () => {
    const { small, regular } = drawings;
    expect(renderLogo(24)).toContain(small.waves);
    expect(renderLogo(8)).toContain(small.waves);
    expect(renderLogo(25)).toContain(regular.waves);
    expect(renderLogo(128)).toContain(regular.waves);
    expect(renderLogo(24)).not.toBe(renderLogo(25));
  });

  test("bare, the drawing sits in its own bounding box", () => {
    expect(renderLogo(64)).toContain(`viewBox="${drawings.regular.vb}"`);
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
    expect(rect!.fill).toBe(S.paper.flatBg);
    expect(rect!["fill-opacity"]).toBeUndefined();
    expect(rect!.opacity).toBeUndefined();
  });

  test("favicon tile has the source's 22.5% corners", () => {
    const rect = firstRect(renderTile(32, "favicon"));
    expect(rect).toBeDefined();
    expect(Number(rect!.rx)).toBeCloseTo(22.5);
    expect(Number(rect!.ry)).toBeCloseTo(22.5);
  });

  test("tile draws the logo in the scheme's color, not currentColor", () => {
    const svg = renderTile(32, "favicon");
    expect(svg).toContain(`fill="${S.paper.fg}"`);
    expect(svg).not.toContain("currentColor");
    const dark = renderTile(32, "favicon", "midnight");
    expect(dark).toContain(`fill="${S.midnight.fg}"`);
  });

  test("the tile places the drawing with its tile transform", () => {
    expect(renderTile(24, "favicon")).toContain(
      `transform="${drawings.small.tf}"`,
    );
    expect(renderTile(32, "favicon")).toContain(
      `transform="${drawings.regular.tf}"`,
    );
  });

  test("is deterministic", () => {
    expect(renderTile(180, "home-screen")).toBe(renderTile(180, "home-screen"));
  });
});
