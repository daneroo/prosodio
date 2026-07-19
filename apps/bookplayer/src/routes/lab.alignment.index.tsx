/**
 * /lab/alignment — epub/vtt alignment surface (plan
 * thoughts/plans/lab-routes-refined.md, S1). Epub/VTT pairs with coverage
 * metrics from cached artifacts, plus artifact-cache visibility.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/lab/alignment/")({
  component: AlignmentRoute,
});

function AlignmentRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">Alignment is dev-only.</p>;
  }
  return <AlignmentPage />;
}

function AlignmentPage() {
  return (
    <div className="p-4">
      <p className="text-xs text-slate-500">
        Alignment — epub/vtt pairs with coverage metrics from cached artifacts,
        plus artifact-cache visibility (plan S4).
      </p>
    </div>
  );
}
