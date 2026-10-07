/**
 * Board 0 · Construction: the settled logo on a large tile with its guides
 * (pilcrow top, bowl centre, arc centre, stem midpoint, tile centre,
 * baseline) and a readout of the values that place them. Claude Design's
 * "Construction · 1a", drawn from `drawLogo` and `placeOnTile`.
 */
import {
  ARC,
  FIT_DEFAULTS,
  LOGO_DEFAULTS,
  PILCROW,
  drawLogo,
  placeOnTile,
  round,
} from "@prosodio/logo/construction";

import { Board, MONO } from "./board";

/** The tile's side, px. */
const SIZE = 420;
/** px per tile unit. */
const PX = SIZE / 100;
const INK = "#461901";

const logo = drawLogo();
const placement = placeOnTile(logo);
const { left, top, right, bottom } = logo.box;
const width = right - left;
const height = bottom - top;

/** A height in u → tile units. */
const tileY = (u: number) => placement.y + placement.scale * u;

const guides = [
  { label: "pilcrow top · 0u", y: tileY(0), color: "#8a8992" },
  {
    label: `bowl centre · ${PILCROW.bowl / 2}u`,
    y: tileY(PILCROW.bowl / 2),
    color: "oklch(0.5 0.2 290)",
  },
  {
    label: `arc centre · ${round(logo.arcCenter.y, 1)}u`,
    y: tileY(logo.arcCenter.y),
    color: "oklch(0.55 0.23 350)",
  },
  {
    label: `stem midpoint · ${PILCROW.height / 2}u`,
    y: tileY(PILCROW.height / 2),
    color: "#8a8992",
  },
  { label: "tile centre", y: 50, color: "oklch(0.6 0.2 25)" },
  {
    label: `baseline · ${PILCROW.height}u`,
    y: tileY(PILCROW.height),
    color: "#8a8992",
  },
].sort((a, b) => a.y - b.y);

/** Each guide's line and its label, labels pushed down so none overlap. */
const placedGuides = (() => {
  let last = -99;
  return guides.map((guide) => {
    const lineTop = guide.y * PX;
    const labelTop = Math.max(lineTop - 8, last + 17);
    last = labelTop;
    return { ...guide, lineTop, labelTop };
  });
})();

const { arcCount, arcHeight, arcGap, arcWeight, arcSweep } = LOGO_DEFAULTS;

const readout = [
  {
    k: "Arc centre",
    v: `${round(logo.arcCenter.y, 1)}u: ${Math.round(arcHeight * 100)}% of the way from stem midpoint (${PILCROW.height / 2}u) to bowl centre (${PILCROW.bowl / 2}u)`,
  },
  {
    k: "Gap to first arc",
    v: `${arcGap}u, ${round(arcGap / PILCROW.stem)}× stem`,
  },
  {
    k: "Arc stroke",
    v: `${round(logo.arcStroke, 1)}u, ${arcWeight}× stem; arc spacing ${ARC.spacing}× stroke`,
  },
  { k: "Arcs", v: `${arcCount}, sweep ±${arcSweep}°` },
  {
    k: "Logo size",
    v: `${round(width, 1)} × ${round(height, 1)}u (${round(width / height)} : 1)`,
  },
  { k: "Tile fill", v: `logo fits a ${FIT_DEFAULTS.fill}% box` },
  {
    k: "Optical offset",
    v: `${FIT_DEFAULTS.opticalY}% down, ${FIT_DEFAULTS.opticalX}% right of geometric centre`,
  },
];

export function ConstructionBoard() {
  return (
    <Board number={0} title="Construction">
      <div className="flex flex-wrap items-start gap-12">
        <div
          className="relative max-w-full flex-none"
          style={{ width: 600, height: SIZE }}
        >
          <div
            className="absolute top-0 left-0"
            style={{
              width: SIZE,
              height: SIZE,
              borderRadius: 94,
              background: "#fffbeb",
              boxShadow: "0 0 0 1px rgba(70,25,1,.12)",
            }}
          >
            <svg viewBox="0 0 100 100" className="block h-full w-full">
              <rect
                x={round(placement.x + placement.scale * left)}
                y={round(placement.y + placement.scale * top)}
                width={round(placement.scale * width)}
                height={round(placement.scale * height)}
                style={{
                  fill: "none",
                  stroke: "oklch(0.6 0.02 270)",
                  strokeWidth: 0.25,
                  strokeDasharray: "1 1",
                }}
              />
              <g transform={placement.transform}>
                <path d={logo.pilcrow} style={{ fill: INK }} />
                <path
                  d={logo.arcs}
                  style={{
                    fill: "none",
                    stroke: INK,
                    strokeWidth: logo.arcStroke,
                    strokeLinecap: "round",
                  }}
                />
              </g>
              <circle
                cx="50"
                cy="50"
                r=".9"
                style={{ fill: "oklch(0.6 0.2 25)" }}
              />
            </svg>
          </div>
          {placedGuides.map((guide) => (
            <div key={guide.label}>
              <div
                className="absolute left-0 max-w-full opacity-90"
                style={{
                  width: 600,
                  top: guide.lineTop,
                  borderTop: `1px dashed ${guide.color}`,
                }}
              />
              <div
                className="absolute px-1 text-[11px] leading-4 whitespace-nowrap"
                style={{
                  left: SIZE + 16,
                  top: guide.labelTop,
                  fontFamily: MONO,
                  color: guide.color,
                  background: "#f3f1ec",
                }}
              >
                {guide.label}
              </div>
            </div>
          ))}
        </div>
        <div className="flex max-w-[420px] flex-[1_1_280px] flex-col gap-3.5">
          {readout.map(({ k, v }) => (
            <div
              key={k}
              className="grid gap-3 border-b border-black/[.07] pb-3 text-[13px] leading-snug"
              style={{ gridTemplateColumns: "150px minmax(0,1fr)" }}
            >
              <div className="text-[#6b6a72]">{k}</div>
              <div>{v}</div>
            </div>
          ))}
          <p className="m-0 text-xs leading-normal text-[#6b6a72]">
            u = construction unit; pilcrow cap height {PILCROW.height}u, stem{" "}
            {PILCROW.stem}u. Red dot is the tile&apos;s geometric centre; the
            dashed box is the logo&apos;s box after optical offset.
          </p>
        </div>
      </div>
    </Board>
  );
}
