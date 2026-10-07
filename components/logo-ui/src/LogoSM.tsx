import { logoFor } from "@prosodio/logo";
import type { SVGProps } from "react";

/**
 * The logo (SM), bare: one color (`currentColor`) on a transparent background,
 * in its own frame, centered in a square. Normal use: `size` (px) sets the
 * square and picks the variant (`logoFor`: small at 24 px and below); without
 * it, a 1em square with the regular variant, sized by CSS. Hidden from
 * assistive tech unless a `title` is given.
 */
export function LogoSM({
  size,
  title,
  className,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "viewBox"> & {
  size?: number;
  title?: string;
}) {
  const { logo, viewBox } = logoFor(size ?? Infinity);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={size ?? "1em"}
      height={size ?? "1em"}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={`block flex-none ${className ?? ""}`.trim()}
      {...props}
    >
      {title && <title>{title}</title>}
      <path d={logo.pilcrow} fill="currentColor" />
      <path
        d={logo.arcs}
        fill="none"
        stroke="currentColor"
        strokeWidth={logo.arcStroke}
        strokeLinecap="round"
      />
    </svg>
  );
}
