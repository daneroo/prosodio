/**
 * The lockup: the logo with the name beside it, the logo's identity in the
 * app's header. Settled in Claude Design (`Prosodio Mark.dc.html`, the chosen
 * in-app bar 3b); its colors are in colors.ts (`LOCKUP_COLORS`).
 */
import { LOCKUP_COLORS } from "./colors.ts";

/** The name the lockup writes, and the app's title. */
export const LOGO_NAME = "Prosodio";

export const LOCKUP = {
  /** Default logo size, px: the header's. */
  size: 24,
  /** The name's font size, × logo size (19 px at 24). */
  nameSizeRatio: 19 / 24,
  /** Gap between logo and name, × logo size (7 px at 24). */
  gapRatio: 7 / 24,
  /** The serif (design `wordmarkFont`: Iowan Old Style). Iowan ships with
   * macOS and iPadOS only; elsewhere the next font in the stack. */
  font: "'Iowan Old Style','Source Serif 4',Georgia,serif",
  weight: 600,
  tracking: "-0.01em",
} as const;

/** One lockup's values, px and CSS. */
export interface LockupStyle {
  logoSize: number;
  nameSize: number;
  gap: number;
  font: string;
  weight: number;
  tracking: string;
  logoColor: string;
  nameColor: string;
}

/** The lockup at a logo size (default: the header's). */
export function lockupStyle(logoSize: number = LOCKUP.size): LockupStyle {
  return {
    logoSize,
    nameSize: logoSize * LOCKUP.nameSizeRatio,
    gap: logoSize * LOCKUP.gapRatio,
    font: LOCKUP.font,
    weight: LOCKUP.weight,
    tracking: LOCKUP.tracking,
    logoColor: LOCKUP_COLORS.logo,
    nameColor: LOCKUP_COLORS.name,
  };
}
