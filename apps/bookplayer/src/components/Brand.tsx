/**
 * How Bookplayer presents itself (spec #25): the name, and the logo beside it
 * in the library header. The pairing lives here, in the host, not in
 * @prosodio/logo-ui. Claude Design's chosen in-app bar (3b): the bare logo at
 * 24 px in amber, the name in the serif, cream.
 */
import { amber, renderVals, serif, wm } from "@prosodio/logo";
import { LogoSM } from "@prosodio/logo-ui";

export const BRAND_NAME = "Prosodio";

const { font } = renderVals();

export function Brand() {
  return (
    <div className="flex items-center" style={{ gap: serif.lgap }}>
      <LogoSM size={24} style={{ color: amber }} />
      <h1
        style={{
          fontFamily: font,
          fontWeight: serif.wmWeight,
          fontSize: serif.wmSize,
          letterSpacing: serif.wmTrack,
          lineHeight: 1,
          color: wm,
        }}
      >
        {BRAND_NAME}
      </h1>
    </div>
  );
}
