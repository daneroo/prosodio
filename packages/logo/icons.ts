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
  /** iOS / iPadOS home screen; opaque, iPadOS applies its own mask. */
  appleTouch: {
    file: "apple-touch-icon.png",
    size: 180,
    shape: "home-screen",
  },
  /** Listed in the web app manifest. */
  manifest: [
    { file: "icon-192.png", size: 192, shape: "home-screen" },
    { file: "icon-512.png", size: 512, shape: "home-screen" },
  ],
} as const satisfies {
  favicon: { file: string; sizes: readonly number[]; shape: TileShape };
  appleTouch: PngIcon;
  manifest: readonly PngIcon[];
};

/** Every PNG file (all but the .ico). */
export const PNG_ICONS: readonly PngIcon[] = [
  ICONS.appleTouch,
  ...ICONS.manifest,
];
