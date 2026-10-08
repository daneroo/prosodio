/**
 * Board 4 · Lockup & top bar: the lockup exactly as the home page draws it
 * (the same <LogoLockup />, on the header's background), then larger.
 * Every value is read from @prosodio/logo (`lockup.ts`, `colors.ts`).
 * Claude Design's in-app bar, chosen 3b.
 */
import { LOCKUP, LOCKUP_COLORS } from "@prosodio/logo";
import { LogoLockup } from "@prosodio/logo-ui";

import { Board, CARD, MONO } from "./board";

/** The library header's classes (routes/index.tsx), less its stickiness. */
const HEADER = "border-b border-slate-700 bg-slate-900 px-4 py-3";

export function LockupBoard() {
  return (
    <Board number={4} title="Lockup & top bar">
      <div className="flex flex-col gap-6 px-10 py-8" style={CARD}>
        <div
          className="text-[11px] text-[#6b6a72]"
          style={{ fontFamily: MONO }}
        >
          logo {LOCKUP_COLORS.logo} · name {LOCKUP_COLORS.name} ·{" "}
          {LOCKUP.font.split(",")[0]} {LOCKUP.weight} · name{" "}
          {LOCKUP.size * LOCKUP.nameSizeRatio}/{LOCKUP.size} · gap{" "}
          {LOCKUP.size * LOCKUP.gapRatio}/{LOCKUP.size}
        </div>
        <div className="overflow-hidden rounded-lg">
          <div className={HEADER}>
            <LogoLockup />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-10 rounded-lg bg-slate-900 px-6 py-6">
          {[48, 96].map((size) => (
            <div key={size} className="flex flex-col gap-2">
              <LogoLockup size={size} />
              <div
                className="text-[10px] text-slate-500"
                style={{ fontFamily: MONO }}
              >
                {size}px
              </div>
            </div>
          ))}
        </div>
      </div>
    </Board>
  );
}
