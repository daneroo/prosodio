/** Provisional asset parameters for tiles (tuned later; see README.md). */
export interface TileParams {
  /** Tile background (CSS color). */
  background: string;
  /** Logo color on the tile (CSS color). */
  color: string;
  /** Optional top-to-bottom background gradient; null = off. */
  gradient: { from: string; to: string } | null;
  /** Optional inset border, in viewBox units; null = off. */
  border: { color: string; width: number } | null;
}

export const DEFAULT_TILE_PARAMS: TileParams = {
  background: "#0f172a", // slate-900
  color: "#22d3ee", // cyan-400
  gradient: null,
  border: null,
};
