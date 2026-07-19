/** Shared `/lab` formatting helpers (plan thoughts/plans/lab-routes-refined.md,
 * S1). Moved out of lab.locate.index.tsx unchanged so every lab surface
 * formats timestamps the same way. */

/** Formats an ISO timestamp for display, falling back to the raw string if it
 * doesn't parse. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
