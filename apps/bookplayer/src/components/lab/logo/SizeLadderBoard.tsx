/**
 * Board 2 · Size ladder: the logo as the app draws it, where the two
 * critical sizing values (sizing.ts) are tuned. The small variant (2 heavier
 * arcs) is used at a logo size ≤ the small-variant threshold, bare or on a
 * tile; a tile's logo size is its size × the logo width on a tile. Claude
 * Design's "Size ladder · rendered at 1×", less its 3-arcs-everywhere row.
 */
import { logoFor, tileLogoFor } from "@prosodio/logo";
import {
  LOGO_WIDTH_ON_TILE_RATIO,
  SMALL_LOGO_MAX_PX,
} from "@prosodio/logo/construction";
import { LogoSM, LogoTile } from "@prosodio/logo-ui";
import type { ReactNode } from "react";

import { Board, Card, MONO } from "./board";

const SIZES = [16, 24, 32, 48, 64, 128] as const;
const INK = "#461901";

export function SizeLadderBoard() {
  return (
    <Board number={2} open={false} title="Size ladder · rendered at 1×">
      <Card className="flex flex-col gap-7 px-10 py-8">
        <div
          className="text-[11px] text-[#6b6a72]"
          style={{ fontFamily: MONO }}
        >
          SMALL_LOGO_MAX_PX = {SMALL_LOGO_MAX_PX} · LOGO_WIDTH_ON_TILE_RATIO ={" "}
          {LOGO_WIDTH_ON_TILE_RATIO} · small = {logoFor(0).logo.arcCount} arcs,
          regular = {logoFor(Infinity).logo.arcCount} arcs
        </div>
        <Row label="Tile">
          {(size) => ({
            node: <LogoTile size={size} />,
            caption: `${size}px · ${tileLogoFor(size).variant}`,
          })}
        </Row>
        <Row label="Bare">
          {(size) => ({
            node: <LogoSM size={size} style={{ color: INK }} />,
            caption: `${size}px · ${logoFor(size).variant}`,
          })}
        </Row>
      </Card>
    </Board>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: (size: number) => { node: ReactNode; caption: string };
}) {
  return (
    <div
      className="grid items-end gap-6"
      style={{ gridTemplateColumns: "120px minmax(0,1fr)" }}
    >
      <div className="pb-5 text-[13px] leading-snug text-[#4a4a52]">
        {label}
      </div>
      <div className="flex flex-wrap items-end gap-7">
        {SIZES.map((size) => {
          const { node, caption } = children(size);
          return (
            <div key={size} className="flex flex-col items-center gap-2">
              {node}
              <div
                className="text-[10px] text-[#8a8992]"
                style={{ fontFamily: MONO }}
              >
                {caption}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
