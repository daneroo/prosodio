/**
 * Match-quality badge (plan thoughts/plans/lab-routes-refined.md, S3;
 * decision D2b). Extracted out of lab.corpora.index.tsx unchanged so
 * Corpora, Epub, and VTT render the same exact/near/mismatch/absent chip.
 */
import type { MatchClass } from "#/lib/types";

export function MatchBadge({ match }: { match: MatchClass }) {
  if (match === "absent") {
    return <span className="text-slate-600">{"—"}</span>;
  }
  const tones: Record<Exclude<MatchClass, "absent">, string> = {
    exact: "bg-emerald-900/60 text-emerald-400",
    near: "bg-amber-900/60 text-amber-400",
    mismatch: "bg-rose-900/60 text-rose-400",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tones[match]}`}
    >
      {match}
    </span>
  );
}
