/**
 * How Bookplayer presents itself (spec #25): the name, and the logo beside it
 * in the library header. The pairing lives here, in the host, not in
 * @prosodio/logo-ui.
 */
import { LogoSM } from "@prosodio/logo-ui";

export const BRAND_NAME = "Prosodio";

export function Brand() {
  return (
    <>
      <LogoSM className="h-6 w-6 shrink-0 text-cyan-400" />
      <h1 className="text-xl font-bold tracking-tight">{BRAND_NAME}</h1>
    </>
  );
}
