/**
 * Pure HTTP decision helpers for the /api/alignment/:bookId endpoint (plan
 * thoughts/plans/bookplayer-align-refine-model.md, T3.2). No fs, no nitro
 * imports — kept unit-testable in isolation; the handler
 * (server/handlers/alignment.ts) is a thin adapter over these.
 */
import type { ArtifactCacheKey } from "./artifact-cache.ts";

/** Weak etag from the cache key; mtimes may be floats, stringified as-is. */
export function artifactEtag(key: ArtifactCacheKey): string {
  return `W/"a${key.schemaVersion}-${key.vttMtimeMs}-${key.epubMtimeMs}"`;
}

/**
 * True when the If-None-Match header (a comma-separated list of etags, or
 * "*") matches the given etag. Exact string comparison per token — no weak
 * comparison quirks since we only ever emit our own weak etags.
 */
export function isNotModified(
  ifNoneMatch: string | null | undefined,
  etag: string,
): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(",")
    .map((token) => token.trim())
    .some((token) => token === "*" || token === etag);
}

/**
 * Picks gzip only when a gz variant is available on disk AND the
 * Accept-Encoding header lists "gzip" with a nonzero q value (a bare token
 * or explicit q > 0). Any other token (e.g. "x-gzip") does not match.
 */
export function pickEncoding(
  acceptEncoding: string | null | undefined,
  gzAvailable: boolean,
): "gzip" | "identity" {
  if (!gzAvailable || !acceptEncoding) return "identity";
  const tokens = acceptEncoding
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const [name, ...params] = token.split(";").map((part) => part.trim());
    if (name?.toLowerCase() !== "gzip") continue;
    const qParam = params.find((param) => param.toLowerCase().startsWith("q="));
    if (qParam) {
      const q = Number.parseFloat(qParam.slice(2));
      if (!Number.isNaN(q) && q === 0) continue;
    }
    return "gzip";
  }
  return "identity";
}
