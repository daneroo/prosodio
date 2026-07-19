/**
 * /lab/corpora — corpus diagnostics surface (plan
 * thoughts/plans/lab-routes-refined.md, S1). Placeholder for canonical
 * corpus findings and basename match quality views; replaces server-log warnings.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/lab/corpora/")({
  component: CorporaRoute,
});

function CorporaRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">Corpora is dev-only.</p>;
  }
  return <CorporaPage />;
}

function CorporaPage() {
  return (
    <div className="p-4">
      <p className="text-xs text-slate-500">
        Corpora — scan findings and basename match quality (plan S2).
      </p>
    </div>
  );
}
