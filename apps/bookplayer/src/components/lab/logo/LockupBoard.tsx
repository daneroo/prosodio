/**
 * Board 4 · Lockups & top bar: the lockup exactly as the home page draws it
 * (the same <LogoLockup />, on the header's background), then larger; its
 * values are read from @prosodio/logo (`lockup.ts`, `colors.ts`). Claude
 * Design's in-app bar, chosen 3b.
 *
 * Then the design's lockups on light (1a), sepia on cream: not used yet,
 * kept as part of the exploration. Composed here from LogoTile and LogoSM;
 * their proportions are the design's, in `DESIGN_1A` below, this board only.
 */
import {
  LOCKUP,
  LOCKUP_COLORS,
  LOGO_NAME,
  TILE_SCHEME,
  TILE_SCHEMES,
  logoFor,
} from "@prosodio/logo";
import { LogoLockup, LogoSM, LogoTile } from "@prosodio/logo-ui";

import { Board, CARD, MONO } from "./board";

/** The library header's classes (routes/index.tsx), less its stickiness. */
const HEADER = "border-b border-slate-700 bg-slate-900 px-4 py-3";

export function LockupBoard() {
  return (
    <Board number={4} title="Lockups & top bar">
      <div className="flex flex-col gap-6 px-10 py-8" style={CARD}>
        <div
          className="text-[11px] text-[#6b6a72]"
          style={{ fontFamily: MONO }}
        >
          logo {LOCKUP_COLORS.logo} · name {LOCKUP_COLORS.name} ·{" "}
          {LOCKUP.font.split(",")[0]} {LOCKUP.weight} · name{" "}
          {LOCKUP.size * LOCKUP.nameSizeRatio}/{LOCKUP.size} · gap{" "}
          {LOCKUP.size * LOCKUP.gapRatio}/{LOCKUP.size}
        </div>
        <div className="overflow-hidden rounded-lg">
          <div className={HEADER}>
            <LogoLockup />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-10 rounded-lg bg-slate-900 px-6 py-6">
          {[48, 96].map((size) => (
            <div key={size} className="flex flex-col gap-2">
              <LogoLockup size={size} />
              <div
                className="text-[10px] text-slate-500"
                style={{ fontFamily: MONO }}
              >
                {size}px
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-10 p-10" style={CARD}>
        <div
          className="text-[11px] text-[#6b6a72]"
          style={{ fontFamily: MONO }}
        >
          lockups on light (design 1a) · not used yet · all sepia
        </div>
        <TileLockup tileSize={120} byline />
        <div className="flex flex-wrap items-center gap-x-14 gap-y-10">
          <TileLockup tileSize={64} />
          <InlineLockup nameSize={56} />
        </div>
      </div>
    </Board>
  );
}

/** The design's lockups on light (1a, `lock()` and `bare`). */
const DESIGN_1A = {
  /** Tile lockups, × tile size. */
  tile: {
    gap: 0.2,
    name: 0.5,
    /** Without the byline, the name is a little larger. */
    nameOnly: 0.52,
    byline: 0.13,
    bylineGap: 0.07,
  },
  /** Inline lockup, × name size: the pilcrow's cap height, and the gap. */
  inline: { capHeight: 0.7, gap: 0.3 },
  weight: 500,
  tracking: "-0.012em",
  bylineTracking: "0.16em",
  byline: "Prose + Prosody",
} as const;

/** Sepia: the chosen tile's logo color, for the name and byline too. */
const SEPIA = TILE_SCHEMES[TILE_SCHEME].logo;

function Name({ size, lineHeight }: { size: number; lineHeight: number }) {
  return (
    <span
      style={{
        fontFamily: LOCKUP.font,
        fontWeight: DESIGN_1A.weight,
        fontSize: size,
        lineHeight,
        letterSpacing: DESIGN_1A.tracking,
        color: SEPIA,
      }}
    >
      {LOGO_NAME}
    </span>
  );
}

function TileLockup({
  tileSize,
  byline = false,
}: {
  tileSize: number;
  byline?: boolean;
}) {
  const t = DESIGN_1A.tile;
  return (
    <div className="flex items-center" style={{ gap: tileSize * t.gap }}>
      <LogoTile size={tileSize} />
      {byline ? (
        <div className="flex flex-col" style={{ gap: tileSize * t.bylineGap }}>
          <Name size={tileSize * t.name} lineHeight={0.9} />
          <span
            style={{
              fontFamily: LOCKUP.font,
              fontSize: tileSize * t.byline,
              letterSpacing: DESIGN_1A.bylineTracking,
              color: SEPIA,
              paddingLeft: 2,
            }}
          >
            {DESIGN_1A.byline}
          </span>
        </div>
      ) : (
        <Name size={tileSize * t.nameOnly} lineHeight={1} />
      )}
    </div>
  );
}

/** Bare logo, its pilcrow (60u) on the name's baseline at
 * `inline.capHeight` of the name size: the logo reads as the first glyph. */
function InlineLockup({ nameSize }: { nameSize: number }) {
  const { box } = logoFor(Infinity).logo;
  const frameWidth = box.right - box.left + 1; // the bare frame, u
  const frameHeight = box.bottom - box.top;
  const pxPerU = (nameSize * DESIGN_1A.inline.capHeight) / 60;
  const logoSize = frameWidth * pxPerU;
  return (
    <div
      className="flex items-baseline"
      style={{ gap: nameSize * DESIGN_1A.inline.gap }}
    >
      <LogoSM
        size={logoSize}
        style={{ height: frameHeight * pxPerU, color: SEPIA }}
      />
      <Name size={nameSize} lineHeight={1} />
    </div>
  );
}
