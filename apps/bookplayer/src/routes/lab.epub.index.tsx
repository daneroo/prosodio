/**
 * /lab/epub — EPUB validation surface (plan thoughts/plans/lab-routes-refined.md,
 * S1). Books with an ebook; validation views inspired by epub-validate.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/lab/epub/")({
  component: EpubRoute,
});

function EpubRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">Epub is dev-only.</p>;
  }
  return <EpubPage />;
}

function EpubPage() {
  return (
    <div className="p-4">
      <p className="text-xs text-slate-500">
        Epub — books with an ebook; validation later (epub-validate is the
        inspiration) (plan S3).
      </p>
    </div>
  );
}
