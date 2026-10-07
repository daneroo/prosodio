import { tileStyle } from "@prosodio/logo";
import { placeOnTile } from "@prosodio/logo/construction";
import type { Logo, TileFit } from "@prosodio/logo/construction";

/**
 * The tile: `logo` on its own square background, `size` px. Placement
 * (`placeOnTile`, `@prosodio/logo/construction`) and look (`tileStyle`,
 * `@prosodio/logo`) come from the package; this only assembles them, with
 * the Claude Design source's markup. `logo` and `fit` are the detailed API
 * (lab boards); a size-only normal form comes with Board 2.
 */
export function LogoTile({
  logo,
  size,
  fit,
  title,
}: {
  logo: Logo;
  size: number;
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
