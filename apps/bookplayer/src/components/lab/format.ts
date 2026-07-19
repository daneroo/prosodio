/** Shared `/lab` formatting helpers (plan thoughts/plans/lab-routes-refined.md,
 * S1). Moved out of lab.locate.index.tsx unchanged so every lab surface
 * formats timestamps the same way. */

/** Formats a timestamp for display — an ISO string (scannedAt, generatedAt)
 * or an epoch-ms number (statSync's mtimeMs, plan lab-routes-refined S4a) —
 * falling back to the raw input if it doesn't parse. ISO 8601 in local
 * time, timezone omitted — the T separator is NOT optional (8601-1:2019
 * dropped the by-mutual-agreement space; docs/coding-style.md "Dates").
 * Locale formats are banned repo-wide. */
export function formatTimestamp(input: string | number): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** MB/GB, one decimal (plan lab-routes-refined S3; moved out of
 * lab.corpora.index.tsx unchanged so Audiobooks/Epub share it). */
export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(1)} MB`;
}
