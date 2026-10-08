/**
 * The icon files: one home for their names, sizes and shapes. The files
 * themselves are generated into Bookplayer's `public/` by
 * `scripts/write-icons.ts` (`bun run icons`); the head links, the manifest,
 * the lab's Board 5 and the manifest test all read this.
 *
 * File set after Evil Martians, "How to Favicon":
 * https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs
 */
import type { TileShape } from "./render.ts";

/** One PNG file: a tile rasterised at `size` px. */
export interface PngIcon {
  file: string;
  size: number;
  shape: TileShape;
}

export const ICONS = {
  /** favicon.ico: one PNG frame per size (both draw the small variant). */
  favicon: {
    file: "favicon.ico",
    sizes: [16, 32],
    shape: "favicon",
  },
  /**
   * iOS / iPadOS Home Screen; opaque, iPadOS applies its own mask. One per
   * device size, so none is resampled: 152 iPad, 167 iPad Pro, 180 iPhone
   * (Apple's sizes; Safari picks the closest). Which of 152 and 167 the iPad
   * Air 4 uses is unconfirmed, so both. 180 keeps the name iOS probes for.
   * https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
   */
  appleTouch: [
    { file: "apple-touch-icon-152x152.png", size: 152, shape: "home-screen" },
    { file: "apple-touch-icon-167x167.png", size: 167, shape: "home-screen" },
    { file: "apple-touch-icon.png", size: 180, shape: "home-screen" },
  ],
  /**
   * Listed in the web app manifest: purpose `any`, plus one `maskable` for
   * Android, which otherwise shrinks the icon onto a white disc. iOS and
   * iPadOS use `appleTouch`, not these.
   */
  manifest: [
    { file: "icon-192.png", size: 192, shape: "home-screen" },
    { file: "icon-512.png", size: 512, shape: "home-screen" },
    { file: "icon-maskable-512.png", size: 512, shape: "maskable" },
  ],
} as const satisfies {
  favicon: { file: string; sizes: readonly number[]; shape: TileShape };
  appleTouch: readonly PngIcon[];
  manifest: readonly PngIcon[];
};

/** Every PNG file (all but the .ico). */
export const PNG_ICONS: readonly PngIcon[] = [
  ...ICONS.appleTouch,
  ...ICONS.manifest,
];
