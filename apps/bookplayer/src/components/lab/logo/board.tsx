/**
 * The /lab/logo page's look, for every section: boards, each its own cream
 * box (the Claude Design source's page) with a mono title that opens and
 * closes it, their content in rounded cards (white, or dark to judge a logo
 * on a dark page).
 */
import type { CSSProperties, ReactNode } from "react";

export const MONO = "'JetBrains Mono',ui-monospace,monospace";

/**
 * One board: its own rounded cream box (the Claude Design source's page),
 * its title the <summary> that opens and closes it (numbered for the SM
 * layers), then its cards.
 */
export function Board({
  number,
  title,
  open = true,
  children,
}: {
  number?: number;
  title: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={open}
      className="rounded-lg px-8 py-5"
      style={{ background: "#f3f1ec", color: "#1c1d26" }}
    >
      <summary
        className="cursor-pointer text-xs tracking-[.06em] text-[#6b6a72] uppercase"
        style={{ fontFamily: MONO }}
      >
        {number === undefined ? title : `Board ${number} · ${title}`}
      </summary>
      <div className="mt-6 mb-3 flex flex-col gap-6">{children}</div>
    </details>
  );
}

/**
 * A rounded card: white, or `dark` (the app's slate). `label` is its own
 * small heading, in a neutral color whatever color the content inherits
 * (`style.color`). `className` sets the layout and padding.
 */
export function Card({
  dark = false,
  label,
  className = "flex flex-col gap-7 px-10 py-8",
  style,
  dataTheme,
  children,
}: {
  dark?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** LogoHero reads `data-theme="dark"` for its dark paper. */
  dataTheme?: "dark";
  children: ReactNode;
}) {
  return (
    <div
      data-theme={dataTheme}
      className={`rounded-[20px] ${dark ? "bg-slate-900" : "bg-white"} shadow-[0_0_0_1px_rgba(0,0,0,.05)] ${className}`}
      style={style}
    >
      {label && (
        <div
          className={`text-[11px] ${dark ? "text-slate-400" : "text-[#6b6a72]"}`}
          style={{ fontFamily: MONO }}
        >
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
