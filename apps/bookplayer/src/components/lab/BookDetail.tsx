/**
 * Book identity detail row (plan thoughts/plans/lab-routes-refined.md, S3).
 * Extracted out of lab.corpora.index.tsx's renderBookDetail unchanged so
 * Corpora and Audiobooks share the id/basename/relDir `<dl>` behind
 * LabTable's chevron-expand slot.
 */
export interface BookDetailFields {
  id: string;
  basename: string;
  relDir: string;
}

export function BookDetail({ book }: { book: BookDetailFields }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-slate-500">id</dt>
      <dd className="text-slate-400">{book.id}</dd>
      <dt className="text-slate-500">basename</dt>
      <dd className="text-slate-400">{book.basename}</dd>
      <dt className="text-slate-500">relDir</dt>
      <dd className="text-slate-400">{book.relDir}</dd>
    </dl>
  );
}
