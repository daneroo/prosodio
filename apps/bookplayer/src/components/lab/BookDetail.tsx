/**
 * Book identity detail row (plan thoughts/plans/lab-routes-refined.md, S3).
 * Extracted out of lab.corpora.index.tsx's renderBookDetail unchanged so
 * Corpora and Audiobooks share the id/basename/relDir `<dl>` behind
 * LabTable's chevron-expand slot. Audiobooks may also include narrator and
 * series for display in the detail expansion.
 */
export interface BookDetailFields {
  id: string;
  basename: string;
  relDir: string;
  narrator?: string | null;
  series?: Array<{ name: string; position: number | null }>;
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
      {book.narrator && (
        <>
          <dt className="text-slate-500">narrator</dt>
          <dd className="text-slate-400">{book.narrator}</dd>
        </>
      )}
      {book.series && book.series.length > 0 && (
        <>
          <dt className="text-slate-500">series</dt>
          <dd className="text-slate-400">
            {book.series
              .map((s) =>
                s.position !== null ? `${s.name} #${s.position}` : s.name,
              )
              .join(", ")}
          </dd>
        </>
      )}
    </dl>
  );
}
