/**
 * /lab/logo — the Logo judged by eye (spec #25). First the Claude Design
 * source's boards (`Prosodio Mark.dc.html`, ported once, on its own page
 * colors); then sections each on the slate shell and on a light background:
 *
 * - SM: LogoSM at several sizes beside the prototype's font-glyph original
 *   (LogoSMOrig), the small drawing at 16 px, and tile previews.
 * - Colors: the logo's color pairs (see below), drawn with LogoSM.
 * - SM, prototype: LogoSMOrig in the prototype's own judging rows (variants,
 *   sized), then the same color pairs — temporary, while LogoSM's path drawing
 *   is not yet adequate (spec #25).
 * - MD: the prototype's judging rows — variants and sizes inside its gradient
 *   containers (`LogoContainer`, `SIZE_MAP`, its daisyUI light/dark colors) —
 *   plus the bare staff logo on the panel's own colors.
 * - The color pairs: dark (rust and midnight blue, either way round) and light
 *   (the hero's paper) — an experiment (#29), not app theming — as rounded
 *   squares at 16–128 px (24: the header size) plus bare, every pair on both
 *   pages.
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
  LogoSMOrig,
  LogoTile,
  staffPositionCount,
} from "@prosodio/logo-ui";
import type { HeroOpening, LogoGlyphs, StaffNotes } from "@prosodio/logo-ui";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import {
  S,
  SMALL_MAX_PX,
  amber,
  f,
  renderLogo,
  renderTile,
  renderVals,
  serif,
  wm,
} from "@prosodio/logo";
import type { Base, SchemeKey, Tile, TileShape } from "@prosodio/logo";

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
      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">
          Logo (SM, Claude Design)
        </h2>
        <DesignBoards />
      </section>
      <Section
        title="Logo (SM)"
        render={(tone) => <SmallPanel tone={tone} />}
      />
      <Section
        title="Colors"
        render={() => (
          <SchemePanel logo={<LogoSM className="h-[58%] w-[58%]" />} />
        )}
      />
      <Section title="Logo (SM, prototype)" render={() => <OrigPanel />} />
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
// SM, Claude Design — the source's boards (`Prosodio Mark.dc.html`), its page
// data under its own names; the logo's values come from @prosodio/logo
// ============================================================================

const { base, mk, tile, schemeKey, small, font, weight, M, lock } =
  renderVals();

const L1 = lock(M, 120, schemeKey),
  L2 = lock(M, 64, schemeKey, false);
const darkKey: SchemeKey = schemeKey === "paper" ? "sepia" : schemeKey;
const LD = lock(M, 96, darkKey),
  LM = lock(M, 64, "midnight", false);
const bfs = 56,
  bh = (bfs * 0.7 * M.bh) / 60;
const bare = {
  m: M,
  fs: bfs,
  h: f(bh),
  w: f((bh * (M.bw + 1)) / M.bh),
  gap: f(bfs * 0.3),
};
const ink = "#461901",
  sub = "oklch(0.45 0.06 50)";

const SCHEME_KEYS = Object.keys(S) as SchemeKey[];

const st = <TKey extends keyof Base>(
  id: string,
  title: string,
  vals: ReadonlyArray<Base[TKey]>,
  key: TKey,
  fmt: (v: Base[TKey]) => string,
) => ({
  id,
  title,
  items: vals.map((v) => {
    const cur =
      typeof v === "number"
        ? Math.abs(v - (base[key] as number)) < 1e-6
        : v === base[key];
    return tile(mk({ [key]: v }), 84, schemeKey, {
      label: fmt(v) + (cur ? " ●" : ""),
      lc: cur ? "#1c1d26" : "#8a8992",
    });
  }),
});
const studies = [
  st("S1", "Wave height", [0, 0.5, 1], "lift", (v) =>
    v === 0 ? "stem mid" : v === 1 ? "bowl" : "between",
  ),
  st("S2", "Gap to first arc", [3, 5, 8], "gap", (v) => `${v}u`),
  st("S3", "Wave weight", [0.65, 0.8, 1], "wr", (v) => `${v}×`),
  st("S4", "Arc count", [2, 3], "n", (v) => `${v} arcs`),
  st("S5", "Arc sweep", [38, 48, 60], "theta", (v) => `±${v}°`),
  st("S6", "Vertical optical offset", [0, 1.5, 3], "oy", (v) => `+${v}%`),
];

const sizes = [16, 24, 32, 48, 64, 128];
const ladders = [
  {
    label: `${S[schemeKey].name} · ${base.n} arcs at every size`,
    items: sizes.map((s) => tile(M, s, schemeKey)),
  },
  ...SCHEME_KEYS.map((k) => ({
    label: `${S[k].name} · 2 heavier arcs ≤24px`,
    items: sizes.map((s) => tile(small(s), s, k)),
  })),
];
const finishes = SCHEME_KEYS.map((k) => ({
  label: S[k].name,
  items: (["flat", "sheen", "glass"] as const).map((fi) =>
    tile(M, 112, k, { label: fi }, fi),
  ),
}));
const darkTiles = [128, 64, 32, 16]
  .map((s) =>
    tile(small(s), s, "sepia", { shadow: "0 0 0 1px rgba(255,251,235,.12)" }),
  )
  .concat(
    [128, 64, 32, 16].map((s) =>
      tile(small(s), s, "midnight", {
        shadow: "0 0 0 1px rgba(255,255,255,.1)",
      }),
    ),
  );

/** Turn 3's top bars, without the library mock below them. */
const bars = [
  {
    id: "3b",
    name: "Bare mark, amber",
    note: "chosen · serif wordmark in cream",
    bar: "#0d1524",
    line: "#1f2a3c",
    mark: amber,
  },
  {
    id: "3d",
    name: "Warm dark",
    note: "alternative app theme · sepia darks, cream mark",
    bar: "oklch(0.175 0.012 55)",
    line: "oklch(0.27 0.018 55)",
    mark: "#fffbeb",
  },
];

const MONO = "'JetBrains Mono',ui-monospace,monospace";
const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: 20,
  boxShadow: "0 0 0 1px rgba(0,0,0,.05)",
};

function DesignBoards() {
  return (
    <div
      className="flex flex-col gap-10 rounded-lg p-8"
      style={{ background: "#f3f1ec", color: "#1c1d26" }}
    >
      <Board title="Library top bar · turn 3">
        {bars.map((v) => (
          <div key={v.id} className="flex flex-col gap-2">
            <BoardTag id={v.id} name={v.name} note={v.note} />
            <div
              className="flex h-11 items-center rounded-lg pr-5 pl-[22px]"
              style={{
                background: v.bar,
                borderBottom: `1px solid ${v.line}`,
                gap: serif.lgap,
              }}
            >
              <LogoSM size={24} style={{ color: v.mark }} />
              <Wordmark
                fs={serif.wmSize}
                lh={1}
                color={wm}
                weight={serif.wmWeight}
                track={serif.wmTrack}
              />
            </div>
          </div>
        ))}
      </Board>

      <Board title="Primary · waves right · lockups">
        <div className="flex flex-col gap-10 p-10" style={CARD}>
          <Lockup L={L1} color={ink} tag={sub} />
          <div className="flex flex-wrap items-center gap-x-14 gap-y-10">
            <Lockup L={L2} color={ink} />
            <div className="flex items-baseline" style={{ gap: bare.gap }}>
              <LogoSM
                drawing={bare.m}
                style={{ width: bare.w, height: bare.h, color: ink }}
              />
              <Wordmark fs={bare.fs} lh={1} color={ink} />
            </div>
          </div>
        </div>
      </Board>

      <Board title="Colourway × finish · 112px">
        <TileRows rows={finishes} />
      </Board>

      <Board title="Studies · settled · one variable at a time">
        <div className="flex flex-wrap gap-6">
          {studies.map((sv) => (
            <div
              key={sv.id}
              className="flex flex-col gap-4 px-6 py-5"
              style={{ ...CARD, borderRadius: 16 }}
            >
              <div className="flex items-baseline gap-2.5 text-[13px]">
                <span style={{ fontFamily: MONO, color: "#6b6a72" }}>
                  {sv.id}
                </span>
                <span>{sv.title}</span>
              </div>
              <div className="flex gap-5">
                {sv.items.map((t) => (
                  <LabeledTile key={t.label} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Board>

      <Board title="Size ladder · rendered at 1×">
        <TileRows rows={ladders} />
      </Board>

      <div
        className="flex flex-col gap-10 px-12 py-11"
        style={{ background: "oklch(0.2 0.03 265)", borderRadius: 20 }}
      >
        <BoardTitle color="oklch(0.75 0.03 265)">On dark</BoardTitle>
        <div className="flex flex-wrap items-center gap-x-[72px] gap-y-12">
          <Lockup L={LD} color="#f4f1ea" tag="oklch(0.8 0.02 265)" />
          <Lockup L={LM} color="oklch(0.78 0.12 58)" />
        </div>
        <div className="flex flex-wrap items-end gap-7">
          {darkTiles.map((t) => (
            <LogoTile key={`${t.fg}-${t.size}`} t={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BoardTitle({
  children,
  color = "#6b6a72",
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <div
      className="text-xs tracking-[.06em] uppercase"
      style={{ fontFamily: MONO, color }}
    >
      {children}
    </div>
  );
}

function Board({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <BoardTitle>{title}</BoardTitle>
      {children}
    </div>
  );
}

function BoardTag({
  id,
  name,
  note,
}: {
  id: string;
  name: string;
  note: string;
}) {
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span
        className="rounded-md px-2 py-0.5 text-xs text-white"
        style={{ fontFamily: MONO, background: "#1c1d26" }}
      >
        {id}
      </span>
      <span>{name}</span>
      <span style={{ color: "#6b6a72" }}>{note}</span>
    </div>
  );
}

/** "Prosodio" in the wordmark font (the `wordmarkFont` Tweak). */
function Wordmark({
  fs,
  lh,
  color,
  weight: w = weight,
  track = "-.012em",
}: {
  fs: number;
  lh: number;
  color: string;
  weight?: number;
  track?: string;
}) {
  return (
    <div
      style={{
        fontFamily: font,
        fontWeight: w,
        fontSize: fs,
        lineHeight: lh,
        letterSpacing: track,
        color,
      }}
    >
      Prosodio
    </div>
  );
}

/** A tile lockup (`lock()`): tile, wordmark, and the tagline when `tag` is
 * its color. */
function Lockup({
  L,
  color,
  tag,
}: {
  L: ReturnType<typeof lock>;
  color: string;
  tag?: string;
}) {
  return (
    <div className="flex items-center" style={{ gap: L.gap }}>
      <LogoTile t={L.t} />
      {tag ? (
        <div className="flex flex-col" style={{ gap: L.tgap }}>
          <Wordmark fs={L.fs} lh={0.9} color={color} />
          <div
            style={{
              fontFamily: font,
              fontSize: L.tfs,
              letterSpacing: ".16em",
              color: tag,
              paddingLeft: 2,
            }}
          >
            Prose + Prosody
          </div>
        </div>
      ) : (
        <Wordmark fs={L.fs} lh={1} color={color} />
      )}
    </div>
  );
}

function LabeledTile({ t }: { t: Tile }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <LogoTile t={t} />
      <div className="text-[11px]" style={{ fontFamily: MONO, color: t.lc }}>
        {t.label}
      </div>
    </div>
  );
}

function TileRows({
  rows,
}: {
  rows: ReadonlyArray<{ label: string; items: ReadonlyArray<Tile> }>;
}) {
  return (
    <div className="flex flex-col gap-7 px-10 py-8" style={CARD}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid items-end gap-6"
          style={{ gridTemplateColumns: "200px minmax(0,1fr)" }}
        >
          <div className="pb-5 text-[13px] leading-snug text-[#4a4a52]">
            {row.label}
          </div>
          <div className="flex flex-wrap items-end gap-7">
            {row.items.map((t) => (
              <LabeledTile key={t.label} t={t} />
            ))}
          </div>
        </div>
      ))}
    </div>
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
              <div style={{ width: size, height: size }}>
                <LogoSMOrig />
              </div>
            </div>
            <Label>{size}</Label>
          </div>
        ))}
      </div>

      <h4 className="mt-3 mb-1 text-xs opacity-60">
        small drawing (≤{SMALL_MAX_PX} px)
      </h4>
      <div className="flex items-end gap-4">
        {[SMALL_MAX_PX, 16, 12].map((size) => (
          <div key={size} className="flex flex-col items-center gap-1">
            <SmallLogo size={size} />
            <Label>{size}</Label>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <SmallLogo size={128} drawnAt={SMALL_MAX_PX} />
          <Label>128 (small drawing, enlarged)</Label>
        </div>
      </div>

      <h4 className="mt-3 mb-1 text-xs opacity-60">tiles</h4>
      <div className="flex flex-wrap items-end gap-4">
        {TILES.flatMap(({ shape, sizes: tileSizes }) =>
          tileSizes.map((size) => (
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

/** The renderer's bare logo drawn for `drawnAt` px (picking its drawing),
 * shown at `size`; inlined so `currentColor` works (it would not inside an
 * <img>). */
function SmallLogo({
  size,
  drawnAt = size,
}: {
  size: number;
  drawnAt?: number;
}) {
  return (
    <span
      className="block [&>svg]:h-full [&>svg]:w-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: renderLogo(drawnAt) }}
    />
  );
}

// ============================================================================
// Colors — the logo's two schemes, each a fg/bg pair (experiment, not app
// theming). Light: LogoHero's paper. Dark: rust and midnight blue (im-qcic
// v2 chromatic accents, dark and light), either way round: still open. Shown as the MD containers' rounded squares, solid, not gradient.
// ============================================================================

const RUST = "#c9803f";
const MIDNIGHT_BLUE = "#1b3a6b";

const SCHEMES: ReadonlyArray<{
  name: string;
  /** Hover detail: where the colors come from. */
  source: string;
  pairs: ReadonlyArray<{ fg: string; bg: string }>;
}> = [
  {
    name: "dark: rust ⇄ midnight blue",
    source: "rust: im-qcic chromatic dark accent; blue: its light accent",
    pairs: [
      { fg: RUST, bg: MIDNIGHT_BLUE },
      { fg: MIDNIGHT_BLUE, bg: RUST },
    ],
  },
  {
    name: "light: ink / paper ✓",
    source: "LogoHero light: amber-950 / amber-50",
    pairs: [{ fg: "#461901", bg: "#fffbeb" }],
  },
];

/** 6 (24 px) is the library header's LogoSM box (`h-6 w-6`). */
const SCHEME_SIZES = [
  4, 6, 8, 16, 32,
] as const satisfies ReadonlyArray<LogoSize>;

/** Hover hint for one square: its size, colors, and the header match. */
function sizeHint(size: LogoSize, colors: string): string {
  const px = size * 4;
  return `${px}×${px} px${size === 6 ? " (header size)" : ""} — ${colors}`;
}

/** The color pairs as tiles and bare. `logo` fills its box: 58% for LogoSM,
 * the Claude Design tile's logo box (`base.box`); the prototype original
 * fills it whole, as in its containers. */
function SchemePanel({ logo }: { logo: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      {SCHEMES.map(({ name, source, pairs }) => (
        <div key={name} title={source}>
          <h4 className="mb-2 font-mono text-xs opacity-60">{name}</h4>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            {pairs.map(({ fg, bg }) => (
              <div key={fg} className="flex items-end gap-4">
                {SCHEME_SIZES.map((size) => (
                  <div
                    key={size}
                    title={sizeHint(size, `${fg} on ${bg}`)}
                    className={`${SIZE_MAP[size]} flex items-center justify-center shadow-xl ring-4 ring-(--proto-base-content)/10`}
                    style={{ background: bg, color: fg }}
                  >
                    {logo}
                  </div>
                ))}
              </div>
            ))}
            {/* Bare: the scheme's fg straight on the page, no tile. */}
            <div
              className="flex items-end gap-4"
              style={{ color: pairs[0]?.fg }}
            >
              {SCHEME_SIZES.map((size) => (
                <div
                  key={size}
                  title={sizeHint(size, `${pairs[0]?.fg ?? ""} bare`)}
                  className={`${SIZE_MAP[size]} flex items-center justify-center`}
                >
                  {logo}
                </div>
              ))}
              <Label>bare</Label>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// SM, prototype — temporary (spec #25): the original's own judging rows
// ============================================================================

const ORIG_VARIANTS: ReadonlyArray<LogoGlyphs> = ["¶)", "¶♫", "¶♪", "(¶", ")¶"];

const ORIG_SIZES = [
  8, 12, 16, 24, 32,
] as const satisfies ReadonlyArray<LogoSize>;

function OrigPanel() {
  return (
    <>
      <h4 className="mb-2 text-xs opacity-60">variants</h4>
      <div className="flex flex-wrap justify-center gap-8">
        {ORIG_VARIANTS.map((glyphs, index) => (
          <LogoContainer
            key={glyphs}
            label={`SVG-${index} (${glyphs})`}
            size={16}
          >
            <LogoSMOrig glyphs={glyphs} />
          </LogoContainer>
        ))}
      </div>

      <h4 className="mt-6 mb-2 text-xs opacity-60">sized (¶))</h4>
      <div className="mb-6 flex flex-wrap items-center justify-center gap-8">
        {ORIG_SIZES.map((size) => (
          <LogoContainer key={size} label={`${size * 4} px`} size={size}>
            <LogoSMOrig />
          </LogoContainer>
        ))}
      </div>

      <SchemePanel logo={<LogoSMOrig />} />
    </>
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
