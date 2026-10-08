/**
 * Board 1 · Studies: one variable at a time, the settled value marked ●.
 * Claude Design's "Studies · settled", drawn from `drawLogo` (S1–S5) and
 * `placeOnTile` (S6) through LogoTile. The study values are lab content;
 * the settled ones are the package defaults.
 */
import {
  FIT_DEFAULTS,
  LOGO_DEFAULTS,
  drawLogo,
} from "@prosodio/logo/construction";
import type { LogoParams, TileFit } from "@prosodio/logo/construction";
import { LogoTile } from "@prosodio/logo-ui";

import { Board, MONO } from "./board";

/** Tile side, px. */
const SIZE = 84;

interface Study {
  id: string;
  title: string;
  values: ReadonlyArray<number>;
  settled: number;
  label: (value: number) => string;
  /** What one value changes: the drawing, or its fit on the tile. */
  vary: (value: number) => {
    params?: Partial<LogoParams>;
    fit?: Partial<TileFit>;
  };
}

const studies: ReadonlyArray<Study> = [
  {
    id: "S1",
    title: "Arc height",
    values: [0, 0.5, 1],
    settled: LOGO_DEFAULTS.arcHeight,
    label: (v) => (v === 0 ? "stem mid" : v === 1 ? "bowl" : "between"),
    vary: (v) => ({ params: { arcHeight: v } }),
  },
  {
    id: "S2",
    title: "Gap to first arc",
    values: [3, 5, 8],
    settled: LOGO_DEFAULTS.arcGap,
    label: (v) => `${v}u`,
    vary: (v) => ({ params: { arcGap: v } }),
  },
  {
    id: "S3",
    title: "Arc weight",
    values: [0.65, 0.8, 1],
    settled: LOGO_DEFAULTS.arcWeight,
    label: (v) => `${v}×`,
    vary: (v) => ({ params: { arcWeight: v } }),
  },
  {
    id: "S4",
    title: "Arc count",
    values: [2, 3],
    settled: LOGO_DEFAULTS.arcCount,
    label: (v) => `${v} arcs`,
    vary: (v) => ({ params: { arcCount: v } }),
  },
  {
    id: "S5",
    title: "Arc sweep",
    values: [38, 48, 60],
    settled: LOGO_DEFAULTS.arcSweep,
    label: (v) => `±${v}°`,
    vary: (v) => ({ params: { arcSweep: v } }),
  },
  {
    id: "S6",
    title: "Vertical optical offset",
    values: [0, 1.5, 3],
    settled: FIT_DEFAULTS.opticalY,
    label: (v) => `+${v}%`,
    vary: (v) => ({ fit: { opticalY: v } }),
  },
];

export function StudiesBoard() {
  return (
    <Board number={1} open={false} title="Studies · one variable at a time">
      <div className="flex flex-wrap gap-6">
        {studies.map((study) => (
          <div
            key={study.id}
            className="flex flex-col gap-4 rounded-2xl bg-white px-6 py-5 shadow-[0_0_0_1px_rgba(0,0,0,.05)]"
          >
            <div className="flex items-baseline gap-2.5 text-[13px]">
              <span className="text-[#6b6a72]" style={{ fontFamily: MONO }}>
                {study.id}
              </span>
              <span>{study.title}</span>
            </div>
            <div className="flex gap-5">
              {study.values.map((value) => {
                const { params, fit } = study.vary(value);
                const settled = Math.abs(value - study.settled) < 1e-6;
                return (
                  <div
                    key={value}
                    className="flex flex-col items-center gap-2.5"
                  >
                    <LogoTile logo={drawLogo(params)} fit={fit} size={SIZE} />
                    <div
                      className="text-[11px]"
                      style={{
                        fontFamily: MONO,
                        color: settled ? "#1c1d26" : "#8a8992",
                      }}
                    >
                      {study.label(value)}
                      {settled && " ●"}
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
