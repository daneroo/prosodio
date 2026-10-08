import { describe, expect, test } from "bun:test";

import { LOCKUP_COLORS } from "./colors.ts";
import { LOCKUP, LOGO_NAME, lockupStyle } from "./lockup.ts";

/** The Claude Design source's chosen in-app lockup (3b). */
describe("lockupStyle", () => {
  test("at its default size: the design's header lockup", () => {
    expect(LOGO_NAME).toBe("Prosodio");
    expect(lockupStyle()).toEqual({
      logoSize: 24,
      nameSize: 19,
      gap: 7,
      font: "'Iowan Old Style','Source Serif 4',Georgia,serif",
      weight: 600,
      tracking: "-0.01em",
      logoColor: "oklch(0.8 0.125 68)",
      nameColor: "#fffbeb",
    });
    expect(LOCKUP_COLORS).toEqual({
      logo: "oklch(0.8 0.125 68)",
      name: "#fffbeb",
    });
  });

  test("name and gap scale with the logo size", () => {
    const style = lockupStyle(48);
    expect(style.logoSize).toBe(48);
    expect(style.nameSize).toBe(38);
    expect(style.gap).toBe(14);
    expect(style.font).toBe(LOCKUP.font);
  });
});
