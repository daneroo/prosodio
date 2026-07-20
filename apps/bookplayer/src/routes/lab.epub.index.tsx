/**
 * /lab/epub — books with an epub (plan thoughts/plans/lab-routes-refined.md,
 * S3; decisions D1/D2b/D9/D10). List-first, no detail view; match-quality
 * badge is the same D2b classification the Corpora tab uses, sharing
 * `fetchScanReport` (src/server/library.ts). Validation views are out of
 * scope here (epub-validate's CLI remains the parser-equivalence surface,
 * per D6).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { fetchScanReport } from "#/server/library";
import { formatBytes } from "#/components/lab/format";
import { LabTable } from "#/components/lab/LabTable";
import { MatchBadge } from "#/components/lab/MatchBadge";
import type { MatchClass } from "@prosodio/corpus";
import type { ScanReportBookRow } from "#/server/library";
import type { LabColumn } from "#/components/lab/LabTable";

export const Route = createFileRoute("/lab/epub/")({
  component: EpubRoute,
});

function EpubRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">Epub is dev-only.</p>;
  }
  return <EpubPage />;
}

type ScanReport = Awaited<ReturnType<typeof fetchScanReport>>;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ScanReport }
  | { status: "error"; message: string };

function EpubPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      try {
        const data = await fetchScanReport();
        if (!aliveRef.current) return;
        setState({ status: "ready", data });
      } catch (error) {
        if (!aliveRef.current) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  return (
    <div className="p-4">
      <h2 className="mb-3 text-sm font-medium text-slate-300">
        Epub — books with an epub
      </h2>

      {state.status === "loading" && (
        <p className="text-xs text-slate-500">Loading scan report…</p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-rose-400">Load failed: {state.message}</p>
      )}
      {state.status === "ready" && <EpubReport data={state.data} />}
    </div>
  );
}

// Fixed display order for the summary line's per-class counts.
const MATCH_CLASS_ORDER: Array<Exclude<MatchClass, "absent">> = [
  "exact",
  "near",
  "mismatch",
];

function EpubReport({ data }: { data: ScanReport }) {
  const rows = data.books.filter((book) => book.hasEpub);
  const counts = new Map<MatchClass, number>();
  for (const book of rows) {
    counts.set(book.epubMatch, (counts.get(book.epubMatch) ?? 0) + 1);
  }
  const classCounts = MATCH_CLASS_ORDER.filter(
    (cls) => (counts.get(cls) ?? 0) > 0,
  ).map((cls) => `${cls} ${counts.get(cls)}`);

  return (
    <>
      <p className="mb-3 text-xs tabular-nums text-slate-500">
        {rows.length} epubs
        {classCounts.length > 0 ? ` · ${classCounts.join(" · ")}` : ""}
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">No epubs found.</p>
      ) : (
        <LabTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={BOOK_COLUMNS}
          minWidthClassName="min-w-[560px]"
        />
      )}
    </>
  );
}

const BOOK_COLUMNS: Array<LabColumn<ScanReportBookRow>> = [
  {
    header: "title",
    className: "max-w-[320px] truncate",
    cell: (book) => (
      <span className="truncate">
        <span className="text-slate-300">{book.title}</span>
        {book.author && (
          <span className="text-slate-500"> — {book.author}</span>
        )}
      </span>
    ),
  },
  {
    header: "epub",
    cell: (book) => <MatchBadge match={book.epubMatch} />,
  },
  {
    header: "size",
    className: "tabular-nums text-slate-400",
    cell: (book) =>
      book.epubSizeBytes === null ? "—" : formatBytes(book.epubSizeBytes),
  },
];
