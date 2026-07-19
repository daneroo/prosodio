/** Shared `/lab` formatting helpers (plan thoughts/plans/lab-routes-refined.md,
 * S1). Moved out of lab.locate.index.tsx unchanged so every lab surface
 * formats timestamps the same way. */

/** Formats a timestamp for display — an ISO string (scannedAt, generatedAt)
 * or an epoch-ms number (statSync's mtimeMs, plan lab-routes-refined S4a) —
 * falling back to the raw input if it doesn't parse. */
export function formatTimestamp(input: string | number): string {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? String(input) : date.toLocaleString();
}

/** MB/GB, one decimal (plan lab-routes-refined S3; moved out of
 * lab.corpora.index.tsx unchanged so Audiobooks/Epub share it). */
export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(1)} MB`;
}
