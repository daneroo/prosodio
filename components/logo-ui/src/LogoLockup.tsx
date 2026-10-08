import { LOGO_NAME, lockupStyle } from "@prosodio/logo";

import { LogoSM } from "./LogoSM.tsx";

/**
 * The lockup: the logo with the name beside it. Every value (name, font,
 * proportions, colors) comes from `@prosodio/logo` (`lockupStyle`); this only
 * assembles them. `size` is the logo size, px (default: the header's).
 * `heading` writes the name as the page's <h1>.
 */
export function LogoLockup({
  size,
  heading = false,
}: {
  size?: number;
  heading?: boolean;
}) {
  const style = lockupStyle(size);
  const Name = heading ? "h1" : "span";
  return (
    <div className="flex items-center" style={{ gap: style.gap }}>
      <LogoSM size={style.logoSize} style={{ color: style.logoColor }} />
      <Name
        style={{
          fontFamily: style.font,
          fontWeight: style.weight,
          fontSize: style.nameSize,
          letterSpacing: style.tracking,
          lineHeight: 1,
          color: style.nameColor,
        }}
      >
        {LOGO_NAME}
      </Name>
    </div>
  );
}
