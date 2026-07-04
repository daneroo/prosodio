/**
 * Phase 1 framework proof: a server function with input validation on the
 * installed @tanstack/react-start. Replaced by the real library server
 * functions in Phase 4.
 */
import { createServerFn } from "@tanstack/react-start";

// Installed @tanstack/react-start 1.168.27 deprecates inputValidator()
// in favor of validator() (verified via dev-server warning, 2026-07-03).
export const fetchHealth = createServerFn({ method: "GET" })
  .validator((echo: string) => {
    if (typeof echo !== "string" || echo.length > 64) {
      throw new Error("echo must be a short string");
    }
    return echo;
  })
  .handler(({ data: echo }) => ({
    ok: true as const,
    echo,
    serverTime: new Date().toISOString(),
  }));
