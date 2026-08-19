/**
 * TEMPORARY (plan bookplayer-reader-theming, T3): a dev-only beacon so the
 * iPad's real touch behavior can be OBSERVED rather than guessed at.
 *
 * Three confident fixes for the dead double-tap gesture failed in a row,
 * each reasoned from a device nobody debugging it could see, while Chrome's
 * touch simulator passed every time — synthetic events exercise our own
 * logic but not WebKit's native gesture recognizers, so a green desktop run
 * says nothing about iOS. This route lets the device report what actually
 * happened, into a file, where it can be read directly.
 *
 * Delete along with the on-screen overlay in EpubReader.tsx once the gesture
 * is confirmed working on-device.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { createServerFn } from "@tanstack/react-start";

import { getConfig } from "#/lib/config";

/** Under the gitignored data dir — this is scratch, never a build input. */
function logPath(): string {
  return join(getConfig().dataDir, "touch-debug.log");
}

export const logTouchBeacon = createServerFn({ method: "POST" })
  .validator((line: unknown) => String(line).slice(0, 500))
  .handler(({ data: line }) => {
    // Dev-only: in production this route should never be reachable, but
    // refuse to write regardless rather than trusting the caller.
    if (process.env.NODE_ENV === "production") return { ok: false };
    const path = logPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${new Date().toISOString()} ${line}\n`);
    return { ok: true };
  });
