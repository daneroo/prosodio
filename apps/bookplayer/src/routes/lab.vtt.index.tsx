/**
 * /lab/vtt — transcript inspection surface (plan
 * thoughts/plans/lab-routes-refined.md, S1). Transcripts with cue counts and
 * span duration metrics.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/lab/vtt/")({
  component: VttRoute,
});

function VttRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">VTT is dev-only.</p>;
  }
  return <VttPage />;
}

function VttPage() {
  return (
    <div className="p-4">
      <p className="text-xs text-slate-500">
        VTT — transcripts with cue counts and span durations (plan S3).
      </p>
    </div>
  );
}
