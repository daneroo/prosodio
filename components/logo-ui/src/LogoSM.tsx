import { VIEW_BOX_SIZE, drawings } from "@prosodio/logo";
import type { SVGProps } from "react";

/**
 * The logo (SM): one color (`currentColor`) on a transparent background, sized
 * by CSS (1em square unless a class or style says otherwise). Hidden from
 * assistive tech unless a `title` is given.
 */
export function LogoSM({
  title,
  className,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "viewBox"> & { title?: string }) {
  const { strokeWidth, paths } = drawings.regular;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`}
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={`align-text-bottom ${className ?? ""}`.trim()}
      {...props}
    >
      {title && <title>{title}</title>}
      {paths.map(({ d, filled }) => (
        <path key={d} d={d} fill={filled ? "currentColor" : undefined} />
      ))}
    </svg>
  );
}
