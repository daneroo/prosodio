import { tileLogoFor, tileStyle } from "@prosodio/logo";
import type { Logo, TileFit } from "@prosodio/logo";
import { placeOnTile } from "@prosodio/logo/construction";

/**
 * The tile: the logo on its own square background, `size` px. Normal use:
 * `size` alone, the variant picked by `tileLogoFor` (from the logo size on
 * the tile). Placement (`placeOnTile`)
 * and look (`tileStyle`) come from the package; this only assembles them,
 * with the Claude Design source's markup.
 *
 * `logo` and `fit` override the variant: the detailed API, for the lab's
 * boards only (Board 1 · Studies).
 */
export function LogoTile({
  size,
  logo = tileLogoFor(size).logo,
  fit,
  title,
}: {
  size: number;
  logo?: Logo;
  fit?: Partial<TileFit>;
  title?: string;
}) {
  const { transform } = placeOnTile(logo, fit);
  const { radius, background, color, shadow } = tileStyle(size);
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
        style={{ display: "block", width: "100%", height: "100%" }}
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
