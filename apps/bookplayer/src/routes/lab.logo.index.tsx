/**
 * /lab/logo — the Logo judged by eye (spec #25), in three sections, each on the
 * slate shell and on a light background:
 *
 * - SM: LogoSM at several sizes beside the prototype's font-glyph original
 *   (bun-one `Logo.tsx`, ported locally here on purpose — not into the
 *   packages), the small drawing at 16 px, and tile previews.
 * - MD: the prototype's judging rows — variants and sizes inside its gradient
 *   containers (`LogoContainer`, `SIZE_MAP`, its daisyUI light/dark colors) —
 *   plus the bare staff logo on the panel's own colors.
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
  LogoSM,
  staffPositionCount,
} from "@prosodio/logo-ui";
import type { HeroOpening, StaffNotes } from "@prosodio/logo-ui";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import {
  SMALL_MAX_PX,
  VIEW_BOX_SIZE,
  renderLogo,
  renderTile,
} from "@prosodio/logo";
import type { TileShape } from "@prosodio/logo";

export const Route = createFileRoute("/lab/logo/")({
  component: LogoRoute,
});

function LogoRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">Logo is dev-only.</p>;
  }
  return <LogoPage />;
}

type Tone = "slate" | "light";

const PANELS: ReadonlyArray<{
  tone: Tone;
  className: string;
  /** The prototype's theme switch; LogoHero reads it for its dark paper. */
  dataTheme?: "dark";
}> = [
  { tone: "slate", className: "bg-slate-900 text-cyan-400", dataTheme: "dark" },
  { tone: "light", className: "bg-slate-100 text-slate-900" },
];

/** The prototype's daisyUI 5.5 theme colors (light / dark) for its
 * containers, as CSS variables on each panel. */
const PROTOTYPE_THEME: Record<Tone, CSSProperties> = {
  slate: {
    "--proto-primary": "oklch(58% 0.233 277.117)",
    "--proto-primary-content": "oklch(96% 0.018 272.314)",
    "--proto-secondary": "oklch(65% 0.241 354.308)",
    "--proto-base-content": "oklch(97.807% 0.029 256.847)",
  } as CSSProperties,
  light: {
    "--proto-primary": "oklch(45% 0.24 277.023)",
    "--proto-primary-content": "oklch(93% 0.034 272.788)",
    "--proto-secondary": "oklch(65% 0.241 354.308)",
    "--proto-base-content": "oklch(21% 0.006 285.885)",
  } as CSSProperties,
};

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
        render={(tone) => <SmallPanel tone={tone} />}
      />
      <Section
        title="Staff logo (MD)"
        render={(tone) => <StaffPanel tone={tone} />}
      />
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
        render={() => (
          <div className="flex justify-center">
            <LogoHero text={opening.text} />
          </div>
        )}
      />
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

function Section({
  title,
  controls,
  render,
}: {
  title: string;
  controls?: ReactNode;
  render: (tone: Tone) => ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-sm font-medium text-slate-300">{title}</h2>
        {controls}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {PANELS.map(({ tone, className, dataTheme }) => (
          <div
            key={tone}
            data-theme={dataTheme}
            style={PROTOTYPE_THEME[tone]}
            className={`rounded-lg border border-slate-700 p-3 ${className}`}
          >
            <h3 className="mb-2 text-xs font-medium opacity-60">{tone}</h3>
            {render(tone)}
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// SM
// ============================================================================

const SIZES = [16, 24, 32, 48, 64, 128] as const;

const TILES: ReadonlyArray<{ shape: TileShape; sizes: ReadonlyArray<number> }> =
  [
    { shape: "favicon", sizes: [16, 32] },
    { shape: "home-screen", sizes: [64, 180] },
  ];

function SmallPanel({ tone }: { tone: Tone }) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        {SIZES.map((size) => (
          <div key={size} className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <LogoSM style={{ width: size, height: size }} />
              <GlyphLogo size={size} />
            </div>
            <Label>{size}</Label>
          </div>
        ))}
      </div>

      <h4 className="mt-3 mb-1 text-xs opacity-60">small drawing (≤16 px)</h4>
      <div className="flex items-end gap-4">
        {[SMALL_MAX_PX, 12].map((size) => (
          <div key={size} className="flex flex-col items-center gap-1">
            <SmallLogo size={size} />
            <Label>{size}</Label>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <SmallLogo size={128} />
          <Label>128 (small drawing, enlarged)</Label>
        </div>
      </div>

      <h4 className="mt-3 mb-1 text-xs opacity-60">tiles</h4>
      <div className="flex flex-wrap items-end gap-4">
        {TILES.flatMap(({ shape, sizes }) =>
          sizes.map((size) => (
            <div
              key={`${tone}-${shape}-${size}`}
              className="flex flex-col items-center gap-1"
            >
              <TileImage shape={shape} size={size} />
              <Label>
                {shape} {size}
              </Label>
            </div>
          )),
        )}
      </div>
    </>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] tabular-nums opacity-60">{children}</span>
  );
}

function TileImage({ shape, size }: { shape: TileShape; size: number }) {
  const svg = renderTile(size, shape);
  return (
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      width={size}
      height={size}
      alt={`${shape} tile`}
    />
  );
}

/** The renderer's small drawing, inlined so `currentColor` works (it would
 * not inside an <img>). */
function SmallLogo({ size }: { size: number }) {
  return (
    <span
      className="block [&>svg]:h-full [&>svg]:w-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: renderLogo(SMALL_MAX_PX) }}
    />
  );
}

/** Prototype original (bun-one Logo.tsx `LogoSM`, glyphs `¶)`): a font-glyph
 * pilcrow plus three stroked arcs. Trimmed port (fixed gap and offset), local
 * to this page. */
function GlyphLogo({ size }: { size: number }) {
  const CENTER_X = 50;
  const GAP = 3;
  const ARCS_OFFSET = 6;
  const rightEdge = CENTER_X + GAP / 2;
  const leftEdge = CENTER_X - GAP / 2;
  const arcsX = rightEdge + ARCS_OFFSET;
  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`}
      width={size}
      height={size}
      className="font-sans font-bold"
      aria-hidden
    >
      <text
        x={leftEdge}
        y="50"
        fontSize="50"
        fill="currentColor"
        textAnchor="end"
        dominantBaseline="central"
      >
        ¶
      </text>
      <g
        transform={`translate(${arcsX}, 50)`}
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M 0 -10 A 15 15 0 0 1 0 10" />
        <path d="M 8 -15 A 25 25 0 0 1 8 15" />
        <path d="M 16 -20 A 35 35 0 0 1 16 20" />
      </g>
    </svg>
  );
}

// ============================================================================
// MD — the prototype's judging rows, verbatim
// ============================================================================

/**
 * The prototype's container: its outer shape, gradient and hover effect.
 * Sizes are Tailwind spacing units (24 = 96 px), as there.
 */
const SIZE_MAP = {
  4: "w-4 h-4 rounded-sm", // 16px (Favicon/Micro)
  6: "w-6 h-6 rounded-md", // 24px (Toolbar/Menu)
  8: "w-8 h-8 rounded-lg", // 32px (Icon)
  10: "w-10 h-10 rounded-xl", // 40px
  12: "w-12 h-12 rounded-xl", // 48px
  16: "w-16 h-16 rounded-2xl", // 64px
  24: "w-24 h-24 rounded-2xl", // 96px (Default)
  32: "w-32 h-32 rounded-3xl", // 128px
  48: "w-48 h-48 rounded-[2.5rem]", // 192px
  64: "w-64 h-64 rounded-[3rem]", // 256px
} as const;

type LogoSize = keyof typeof SIZE_MAP;

function LogoContainer({
  label,
  children,
  size = 24,
}: {
  label: string;
  children: ReactNode;
  size?: LogoSize;
}) {
  return (
    <div className="group flex cursor-pointer flex-col items-center gap-4">
      <div
        className={`${SIZE_MAP[size]} relative flex items-center justify-center overflow-hidden bg-linear-to-tr from-(--proto-secondary) to-(--proto-primary) text-(--proto-primary-content) shadow-xl ring-4 shadow-(color:--proto-primary)/20 ring-(--proto-base-content)/10 transition-transform group-hover:scale-110`}
      >
        {children}
      </div>
      <span className="text-sm opacity-70">{label}</span>
    </div>
  );
}

/** MD-0, the fixed reference; the rest random per mount (client-only). */
const MD_VARIANTS: ReadonlyArray<{
  label: string;
  staffLines: number;
  minY: number;
  maxY: number;
  random: boolean;
}> = [
  { label: "MD-0 (5-Line)", staffLines: 5, minY: 30, maxY: 70, random: false },
  { label: "MD-1 (Rand A)", staffLines: 5, minY: 30, maxY: 70, random: true },
  {
    label: "MD-1.1 (4-Line Rand)",
    staffLines: 4,
    minY: 35,
    maxY: 65,
    random: true,
  },
  {
    label: "MD-2 (3-Line Rand B)",
    staffLines: 3,
    minY: 35,
    maxY: 65,
    random: true,
  },
  {
    label: "MD-3 (3-Line Rand C)",
    staffLines: 3,
    minY: 35,
    maxY: 65,
    random: true,
  },
];

const MD_SIZES = [16, 24, 48, 64] as const satisfies ReadonlyArray<LogoSize>;

function StaffPanel({ tone }: { tone: Tone }) {
  return (
    <>
      <h4 className="mb-2 text-xs opacity-60">variants</h4>
      <div className="flex flex-wrap justify-center gap-8">
        {MD_VARIANTS.map(({ label, random, ...staff }) => (
          <LogoContainer key={`${tone}-${label}`} label={label}>
            {random ? <RandomLogoMD {...staff} /> : <LogoMD {...staff} />}
          </LogoContainer>
        ))}
      </div>

      <h4 className="mt-6 mb-2 text-xs opacity-60">sized (MD-0)</h4>
      <div className="flex flex-wrap items-center justify-center gap-8">
        {MD_SIZES.map((size) => (
          <LogoContainer key={size} label={`${size * 4} px`} size={size}>
            <LogoMD />
          </LogoContainer>
        ))}
      </div>

      <h4 className="mt-6 mb-2 text-xs opacity-60">bare (MD-0)</h4>
      <div className="flex flex-wrap items-end justify-center gap-8">
        {[48, 96, 192].map((size) => (
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
