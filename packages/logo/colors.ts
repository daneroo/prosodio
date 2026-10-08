/**
 * The logo's colors: its color language is sepia, cream, midnight, rust and
 * amber. Tiles and the lockup use the logo's own colors (a tile has no page
 * behind it; the lockup is the logo's identity); the bare logo instead takes
 * `currentColor` from the page it sits on.
 *
 * Settled in Claude Design (`Prosodio Mark.dc.html`: its `S` schemes, the
 * in-app bar 3b); the
 * design's names in comments. `tileStyle` (tile.ts) turns a scheme and a
 * finish into CSS.
 */

/** A background color: its flat CSS value, and its oklch lightness, chroma
 * and hue, which the sheen and glass finishes lighten and darken. */
export interface TileBackground {
  flat: string;
  L: number;
  C: number;
  H: number;
}

/** Design "amber": the lockup's logo on the app's dark bar (3b). */
const amber = "oklch(0.8 0.125 68)";

const cream: TileBackground = { flat: "#fffbeb", L: 0.985, C: 0.025, H: 95 };
const sepia: TileBackground = { flat: "#461901", L: 0.29, C: 0.08, H: 45 };
const midnight: TileBackground = {
  flat: "oklch(0.32 0.07 262)",
  L: 0.32,
  C: 0.07,
  H: 262,
};
const rust: TileBackground = {
  flat: "oklch(0.67 0.13 52)",
  L: 0.67,
  C: 0.13,
  H: 52,
};

/** A scheme: the logo's color on a background. */
export interface TileScheme {
  /** As read: "sepia on cream". */
  name: string;
  background: TileBackground;
  /** The logo's color. */
  logo: string;
  /** Tint of the tile's drop shadow. */
  shadow: string;
  /** A 1px edge, for a background too light to show its own. */
  edge?: string;
  /** A light background: the finishes light it less and darken it more. */
  light?: boolean;
}

export const TILE_SCHEMES = {
  /** Design `paper`, "Sepia on cream": the lead. */
  sepiaOnCream: {
    name: "sepia on cream",
    background: cream,
    logo: sepia.flat,
    shadow: "rgba(70,25,1,.22)",
    edge: "rgba(70,25,1,.14)",
    light: true,
  },
  /** Design `sepia`, "Cream on sepia". */
  creamOnSepia: {
    name: "cream on sepia",
    background: sepia,
    logo: cream.flat,
    shadow: "rgba(50,18,0,.4)",
  },
  /** Design `midnight`, "Rust on midnight": rust lightened for midnight. */
  rustOnMidnight: {
    name: "rust on midnight",
    background: midnight,
    logo: "oklch(0.74 0.13 58)",
    shadow: "rgba(10,20,50,.4)",
  },
  /** Design `rust`, "Midnight on rust": midnight darkened for rust. */
  midnightOnRust: {
    name: "midnight on rust",
    background: rust,
    logo: "oklch(0.27 0.07 262)",
    shadow: "rgba(80,40,10,.32)",
  },
} as const satisfies Record<string, TileScheme>;

export type TileSchemeKey = keyof typeof TILE_SCHEMES;

/** Flat: the background as is. Sheen: a soft top-left light falloff. Glass:
 * sheen plus a specular band across the upper half. */
export const TILE_FINISHES = ["flat", "sheen", "glass"] as const;

export type TileFinish = (typeof TILE_FINISHES)[number];

/** The chosen scheme: favicon, Home Screen and manifest tiles. */
export const TILE_SCHEME: TileSchemeKey = "sepiaOnCream";

/** The chosen finish. */
export const TILE_FINISH: TileFinish = "flat";

/** The lockup's colors (design 3b): the logo in amber, the name in cream,
 * for the app's dark bar. */
export const LOCKUP_COLORS = { logo: amber, name: cream.flat } as const;
