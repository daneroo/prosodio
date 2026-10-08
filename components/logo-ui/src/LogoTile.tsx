import { tileLogoFor, tileStyle } from "@prosodio/logo";
import type { Logo, TileFinish, TileFit, TileSchemeKey } from "@prosodio/logo";
import { placeOnTile } from "@prosodio/logo/construction";

/**
 * The tile: the logo on its own square background, `size` px. Normal use:
 * `size` alone, the variant picked by `tileLogoFor` (from the logo size on
 * the tile), in the chosen `scheme` and `finish` (colors.ts) unless given.
 * Placement (`placeOnTile`) and look (`tileStyle`) come from the package;
 * this only assembles them, with the Claude Design source's markup. Colors
 * go in inline styles, never into class names.
 *
 * `logo` and `fit` override the variant: the detailed API, for the lab's
 * boards only (Board 1 · Studies).
 */
export function LogoTile({
  size,
  logo = tileLogoFor(size).logo,
  fit,
  scheme,
  finish,
  title,
}: {
  size: number;
  scheme?: TileSchemeKey;
  finish?: TileFinish;
  logo?: Logo;
  fit?: Partial<TileFit>;
  title?: string;
}) {
  const { transform } = placeOnTile(logo, fit);
  const { radius, background, color, shadow, logoFilter } = tileStyle(
    size,
    scheme,
    finish,
  );
  return (
    <div
      role={title ? "img" : undefined}
      aria-label={title}
      style={{
        position: "relative",
        flex: "none",
        width: size,
        height: size,
        borderRadius: radius,
        background,
        boxShadow: shadow,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        aria-hidden
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          filter: logoFilter,
        }}
      >
        <g transform={transform}>
          <path d={logo.pilcrow} style={{ fill: color }} />
          <path
            d={logo.arcs}
            style={{
              fill: "none",
              stroke: color,
              strokeWidth: logo.arcStroke,
              strokeLinecap: "round",
            }}
          />
        </g>
      </svg>
    </div>
  );
}
