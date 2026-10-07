import { drawingFor, drawings } from "@prosodio/logo";
import type { Drawing } from "@prosodio/logo";
import type { SVGProps } from "react";

/**
 * The logo (SM), bare: one color (`currentColor`) on a transparent background,
 * the drawing in its own bounding box (`vb`), centered in a square. The
 * Claude Design source's bare markup (In-app bar, 3b).
 *
 * `size` (px) sets the square and picks the drawing (the small one at 24 px
 * and below); without it, a 1em square with the regular drawing, sized by CSS.
 * `drawing` overrides the pick (lab studies). Hidden from assistive tech
 * unless a `title` is given.
 */
export function LogoSM({
  size,
  drawing = size === undefined ? drawings.regular : drawingFor(size),
  title,
  className,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "viewBox"> & {
  size?: number;
  drawing?: Drawing;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={drawing.vb}
      width={size ?? "1em"}
      height={size ?? "1em"}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={`block flex-none ${className ?? ""}`.trim()}
      {...props}
    >
      {title && <title>{title}</title>}
      <path d={drawing.pil} fill="currentColor" />
      <path
        d={drawing.waves}
        fill="none"
        stroke="currentColor"
        strokeWidth={drawing.sw}
        strokeLinecap="round"
      />
    </svg>
  );
}
