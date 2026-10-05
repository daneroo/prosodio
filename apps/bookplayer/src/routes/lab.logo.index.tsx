/**
 * /lab/logo — the Logo judged by eye (spec #25): LogoSM at several sizes beside
 * the prototype's font-glyph original (bun-one `Logo.tsx`, ported locally here
 * on purpose — not into the packages), the small drawing at 16 px, and tile
 * previews. Shown on the slate shell and on a light background. Deterministic:
 * nothing random.
 */
import { LogoSM } from "@prosodio/logo-ui";
import { createFileRoute } from "@tanstack/react-router";

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

const SIZES = [16, 24, 32, 48, 64, 128] as const;

const TILES: ReadonlyArray<{ shape: TileShape; sizes: ReadonlyArray<number> }> =
  [
    { shape: "favicon", sizes: [16, 32] },
    { shape: "home-screen", sizes: [64, 180] },
  ];

function LogoPage() {
  return (
    <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
      <Panel name="slate" className="bg-slate-900 text-cyan-400" />
      <Panel name="light" className="bg-slate-100 text-slate-900" />
    </div>
  );
}

function Panel({ name, className }: { name: string; className: string }) {
  return (
    <section className={`rounded-lg border border-slate-700 p-3 ${className}`}>
      <h2 className="mb-2 text-xs font-medium opacity-60">{name}</h2>

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

      <h3 className="mt-3 mb-1 text-xs opacity-60">small drawing (≤16 px)</h3>
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

      <h3 className="mt-3 mb-1 text-xs opacity-60">tiles</h3>
      <div className="flex flex-wrap items-end gap-4">
        {TILES.flatMap(({ shape, sizes }) =>
          sizes.map((size) => (
            <div
              key={`${shape}-${size}`}
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
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
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
