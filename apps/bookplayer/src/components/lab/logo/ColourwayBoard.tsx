/**
 * Board 3 · Colourway × finish: every tile scheme (sepia, cream, midnight,
 * rust) in every finish, at 112 px, ● on the chosen pair. Colors come from
 * @prosodio/logo `colors.ts` only. Claude Design's "Colourway × finish".
 */
import {
  TILE_FINISH,
  TILE_FINISHES,
  TILE_SCHEME,
  TILE_SCHEMES,
} from "@prosodio/logo";
import type { TileSchemeKey } from "@prosodio/logo";
import { LogoTile } from "@prosodio/logo-ui";

import { Board, CARD, MONO } from "./board";

const SIZE = 112;
const SCHEME_KEYS = Object.keys(TILE_SCHEMES) as TileSchemeKey[];

export function ColourwayBoard() {
  return (
    <Board number={3} title={`Colourway × finish · ${SIZE}px`}>
      <div className="flex flex-col gap-7 px-10 py-8" style={CARD}>
        {SCHEME_KEYS.map((scheme) => (
          <div
            key={scheme}
            className="grid items-center gap-6"
            style={{ gridTemplateColumns: "160px minmax(0,1fr)" }}
          >
            <div className="text-[13px] text-[#4a4a52]">
              {TILE_SCHEMES[scheme].name}
            </div>
            <div className="flex flex-wrap gap-8">
              {TILE_FINISHES.map((finish) => {
                const chosen = scheme === TILE_SCHEME && finish === TILE_FINISH;
                return (
                  <div
                    key={finish}
                    className="flex flex-col items-center gap-2.5"
                  >
                    <LogoTile size={SIZE} scheme={scheme} finish={finish} />
                    <div
                      className="text-[11px]"
                      style={{
                        fontFamily: MONO,
                        color: chosen ? "#1c1d26" : "#8a8992",
                      }}
                    >
                      {finish}
                      {chosen && " ●"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Board>
  );
}
