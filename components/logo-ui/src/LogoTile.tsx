import type { Tile } from "@prosodio/logo";

/**
 * The tile: the logo on its own square background. Renders one `Tile` (the
 * Claude Design source's `tile()` result: size, `rad` corners, `bg`, `shadow`,
 * the logo in `fg` placed by `tf`, `mf` filter) with the source's markup.
 * All values come from `@prosodio/logo`; this only assembles them.
 */
export function LogoTile({ t, title }: { t: Tile; title?: string }) {
  return (
    <div
      role={title ? "img" : undefined}
      aria-label={title}
      style={{
        position: "relative",
        flex: "none",
        width: t.size,
        height: t.size,
        borderRadius: t.rad,
        background: t.bg,
        boxShadow: t.shadow,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        aria-hidden
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          filter: t.mf,
        }}
      >
        <g transform={t.tf}>
          <path d={t.pil} style={{ fill: t.fg }} />
          <path
            d={t.waves}
            style={{
              fill: "none",
              stroke: t.fg,
              strokeWidth: t.sw,
              strokeLinecap: "round",
            }}
          />
        </g>
      </svg>
    </div>
  );
}
