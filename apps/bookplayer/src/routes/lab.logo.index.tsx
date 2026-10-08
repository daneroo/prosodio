/**
 * /lab/logo — the Logo judged by eye (spec #25), in three sections of
 * collapsible boards (`components/lab/logo/board.tsx`). First the SM logo's
 * boards (construction open; studies, size ladder, colourway × finish,
 * lockups & top bar, icons closed), drawn from @prosodio/logo; then the MD
 * and Hero logos, each on a dark and a light card:
 *
 * - MD: the staff logo's variants and sizes on tiles (`tileStyle`: sepia on
 *   cream on the light panel, rust on midnight on the dark one), then bare on
 *   the panel's own color (sepia or rust).
 * - Hero: LogoHero with a chosen opening; the slate panel carries
 *   `data-theme="dark"`, the hero's dark-paper switch.
 *
 * The random MD variants are lab-only and client-only: drawn after mount, so
 * SSR and hydration see empty containers.
 */
import {
  HERO_OPENINGS,
  LogoHero,
  LogoMD,
  staffPositionCount,
} from "@prosodio/logo-ui";
import type { HeroOpening, StaffNotes } from "@prosodio/logo-ui";
import { TILE_SCHEMES, tileStyle } from "@prosodio/logo";
import type { TileSchemeKey } from "@prosodio/logo";
import { createFileRoute } from "@tanstack/react-router";

import { Board, Card } from "#/components/lab/logo/board";
import { ColourwayBoard } from "#/components/lab/logo/ColourwayBoard";
import { ConstructionBoard } from "#/components/lab/logo/ConstructionBoard";
import { IconsBoard } from "#/components/lab/logo/IconsBoard";
import { LockupBoard } from "#/components/lab/logo/LockupBoard";
import { SizeLadderBoard } from "#/components/lab/logo/SizeLadderBoard";
import { StudiesBoard } from "#/components/lab/logo/StudiesBoard";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/lab/logo/")({
  component: LogoRoute,
});

function LogoRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">Logo is dev-only.</p>;
  }
  return <LogoPage />;
}

/** The page each panel stands for. */
type Context = "dark" | "light";

/** Each panel's tile scheme: its MD tiles, and its text in that scheme's
 * logo color (rust on the dark panel, sepia on the light one). */
const PANELS: ReadonlyArray<{
  context: Context;
  scheme: TileSchemeKey;
  /** The prototype's theme switch; LogoHero reads it for its dark paper. */
  dataTheme?: "dark";
}> = [
  {
    context: "dark",
    scheme: "rustOnMidnight",
    dataTheme: "dark",
  },
  { context: "light", scheme: "sepiaOnCream" },
];

function LogoPage() {
  const [openingIndex, setOpeningIndex] = useState(0);
  const opening = HERO_OPENINGS[OPENING_KEYS[openingIndex] ?? "nameOfTheWind"];
  const step = (delta: number) =>
    setOpeningIndex(
      (index) => (index + delta + OPENING_KEYS.length) % OPENING_KEYS.length,
    );
  return (
    <div className="flex flex-col gap-6 p-4">
      <Section
        title="Logo (SM)"
        note="How the code is split: packages/logo/README.md, “Code: boundaries and use”."
      >
        <ConstructionBoard />
        <StudiesBoard />
        <SizeLadderBoard />
        <ColourwayBoard />
        <LockupBoard />
        <IconsBoard />
      </Section>
      <Section title="Staff logo (MD)">
        <Board title="Variants, sizes, bare">
          <Contexts render={(scheme) => <StaffPanel scheme={scheme} />} />
        </Board>
      </Section>
      <Section
        title="Hero logo"
        controls={
          <div className="flex items-center gap-1 text-slate-300">
            <ChevronButton direction="previous" onClick={() => step(-1)} />
            {/* All titles stacked in one cell: as wide as the longest, so
                the arrows sit tight and never move; only the current shows. */}
            <span className="grid px-0.5 font-serif text-sm italic">
              {OPENING_KEYS.map((key) => (
                <span
                  key={key}
                  aria-hidden={key !== OPENING_KEYS[openingIndex]}
                  className={`col-start-1 row-start-1 text-center ${key === OPENING_KEYS[openingIndex] ? "" : "invisible"}`}
                >
                  {HERO_OPENINGS[key].title}
                </span>
              ))}
            </span>
            <ChevronButton direction="next" onClick={() => step(1)} />
            <span className="text-[10px] tabular-nums text-slate-500">
              {openingIndex + 1}/{OPENING_KEYS.length}
            </span>
          </div>
        }
      >
        <Board title="Openings">
          <Contexts
            heading={(scheme) =>
              scheme === "sepiaOnCream"
                ? "sepia on cream"
                : "warm gray on charcoal"
            }
            render={() => (
              <div className="flex justify-center">
                <LogoHero text={opening.text} />
              </div>
            )}
          />
        </Board>
      </Section>
    </div>
  );
}

/** Hero openings in cycling order; the default first. */
const OPENING_KEYS = Object.keys(HERO_OPENINGS) as HeroOpening[];

function ChevronButton({
  direction,
  onClick,
}: {
  direction: "previous" | "next";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${direction} opening`}
      title={`${direction} opening`}
      className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-cyan-400 active:scale-95"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path
          d={direction === "previous" ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"}
        />
      </svg>
    </button>
  );
}

/** A section of the page: its heading (and controls), then its boards. */
function Section({
  title,
  note,
  controls,
  children,
}: {
  title: string;
  note?: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-sm font-medium text-slate-300">{title}</h2>
        {controls}
      </div>
      {note && <p className="mb-2 text-xs text-slate-500">{note}</p>}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** The dark and light pair: one card each, the content in its scheme's
 * logo color. */
function Contexts({
  render,
  heading = (scheme) => TILE_SCHEMES[scheme].name,
}: {
  render: (scheme: TileSchemeKey) => ReactNode;
  /** Each card's heading; default: its scheme's name. */
  heading?: (scheme: TileSchemeKey) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {PANELS.map(({ context, scheme, dataTheme }) => (
        <Card
          key={context}
          dark={context === "dark"}
          label={heading(scheme)}
          className="flex flex-col gap-3 p-6"
          style={{ color: TILE_SCHEMES[scheme].logo }}
          dataTheme={dataTheme}
        >
          {render(scheme)}
        </Card>
      ))}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] tabular-nums text-slate-500">{children}</span>
  );
}

// ============================================================================
// MD — the staff logo on tiles and bare
// ============================================================================

/** The staff logo on a tile (`tileStyle`), `size` px; grows on hover, as
 * in the prototype. */
function StaffTile({
  label,
  size,
  scheme,
  children,
}: {
  label: string;
  size: number;
  scheme: TileSchemeKey;
  children: ReactNode;
}) {
  const { radius, background, color, shadow } = tileStyle(size, scheme);
  return (
    <div className="group flex cursor-pointer flex-col items-center gap-4">
      <div
        className="flex items-center justify-center overflow-hidden transition-transform group-hover:scale-110"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background,
          color,
          boxShadow: shadow,
        }}
      >
        {children}
      </div>
      <Label>{label}</Label>
    </div>
  );
}

/** The fixed default first; the rest random per mount (client-only). */
const MD_VARIANTS: ReadonlyArray<{
  label: string;
  staffLines: number;
  minY: number;
  maxY: number;
  random: boolean;
}> = [
  { label: "5 lines ●", staffLines: 5, minY: 30, maxY: 70, random: false },
  {
    label: "5 lines · random",
    staffLines: 5,
    minY: 30,
    maxY: 70,
    random: true,
  },
  {
    label: "4 lines · random",
    staffLines: 4,
    minY: 35,
    maxY: 65,
    random: true,
  },
  {
    label: "3 lines · random",
    staffLines: 3,
    minY: 35,
    maxY: 65,
    random: true,
  },
];

/** Variant tiles, px. */
const MD_VARIANT_SIZE = 96;
/** Tile and bare sizes, px. */
const MD_SIZES = [64, 96, 192, 256] as const;
const MD_BARE_SIZES = [48, 96, 192] as const;

function StaffPanel({ scheme }: { scheme: TileSchemeKey }) {
  return (
    <>
      <h4 className="mb-2 text-xs text-slate-500">variants</h4>
      <div className="flex flex-wrap justify-center gap-8">
        {MD_VARIANTS.map(({ label, random, ...staff }) => (
          <StaffTile
            key={label}
            label={label}
            size={MD_VARIANT_SIZE}
            scheme={scheme}
          >
            {random ? <RandomLogoMD {...staff} /> : <LogoMD {...staff} />}
          </StaffTile>
        ))}
      </div>

      <h4 className="mt-6 mb-2 text-xs text-slate-500">sized (5 lines)</h4>
      <div className="flex flex-wrap items-center justify-center gap-8">
        {MD_SIZES.map((size) => (
          <StaffTile
            key={size}
            label={`${size} px`}
            size={size}
            scheme={scheme}
          >
            <LogoMD />
          </StaffTile>
        ))}
      </div>

      <h4 className="mt-6 mb-2 text-xs text-slate-500">bare (5 lines)</h4>
      <div className="flex flex-wrap items-end justify-center gap-8">
        {MD_BARE_SIZES.map((size) => (
          <div key={size} className="flex flex-col items-center gap-1">
            <div style={{ width: size, height: size }}>
              <LogoMD />
            </div>
            <Label>{size} px</Label>
          </div>
        ))}
      </div>
    </>
  );
}

/** The prototype's random notes, drawn after mount so SSR never sees them. */
function RandomLogoMD({
  staffLines,
  minY,
  maxY,
}: {
  staffLines: number;
  minY: number;
  maxY: number;
}) {
  const [notesYs, setNotesYs] = useState<StaffNotes | null>(null);
  useEffect(() => {
    const count = staffPositionCount(staffLines);
    const pick = () => Math.floor(Math.random() * count);
    setNotesYs([pick(), pick(), pick(), pick()]);
  }, [staffLines]);
  if (!notesYs) return null;
  return (
    <LogoMD staffLines={staffLines} minY={minY} maxY={maxY} notesYs={notesYs} />
  );
}
