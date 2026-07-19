/**
 * /lab/audiobooks — every m4b with its ffprobe metadata (plan
 * thoughts/plans/lab-routes-refined.md, S3; decisions D1/D9/D10). List-first,
 * no detail view beyond book identity — same data-fetch shape and LabTable
 * rendering as lab.corpora.index.tsx, sharing its `fetchScanReport` server fn
 * (src/server/library.ts) since the row already carries everything this page
 * needs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { formatDuration } from "#/lib/browse";
import { fetchScanReport } from "#/server/library";
import { BookDetail } from "#/components/lab/BookDetail";
import { formatBytes } from "#/components/lab/format";
import { LabTable } from "#/components/lab/LabTable";
import type { ScanReportBookRow } from "#/server/library";
import type { LabColumn } from "#/components/lab/LabTable";

export const Route = createFileRoute("/lab/audiobooks/")({
  component: AudiobooksRoute,
});

function AudiobooksRoute() {
  if (!import.meta.env.DEV) {
    return (
      <p className="p-4 text-sm text-slate-400">Audiobooks is dev-only.</p>
    );
  }
  return <AudiobooksPage />;
}

type ScanReport = Awaited<ReturnType<typeof fetchScanReport>>;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ScanReport }
  | { status: "error"; message: string };

function AudiobooksPage() {
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
        Audiobooks — every m4b with ffprobe metadata
      </h2>

      {state.status === "loading" && (
        <p className="text-xs text-slate-500">Loading scan report…</p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-rose-400">Load failed: {state.message}</p>
      )}
      {state.status === "ready" && <AudiobooksReport data={state.data} />}
    </div>
  );
}

function AudiobooksReport({ data }: { data: ScanReport }) {
  const probed = data.books.filter((book) => book.durationSec !== null).length;

  return (
    <>
      <p className="mb-3 text-xs tabular-nums text-slate-500">
        {data.books.length} books · {probed} probed
      </p>

      {data.books.length === 0 ? (
        <p className="text-xs text-slate-500">No books found.</p>
      ) : (
        <LabTable
          rows={data.books}
          rowKey={(row) => row.id}
          columns={BOOK_COLUMNS}
          renderDetail={renderBookDetail}
          minWidthClassName="min-w-[720px]"
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
        {book.narrator && (
          <span className="text-slate-500"> • {book.narrator}</span>
        )}
      </span>
    ),
  },
  {
    header: "duration",
    className: "tabular-nums text-slate-400",
    cell: (book) => formatDuration(book.durationSec),
  },
  {
    header: "size",
    className: "tabular-nums text-slate-400",
    cell: (book) => formatBytes(book.sizeBytes),
  },
  {
    header: "codec",
    className: "text-slate-400",
    cell: (book) => book.codec ?? "—",
  },
  {
    header: "bitrate",
    className: "tabular-nums text-slate-400",
    cell: (book) =>
      book.bitrateKbps === null ? "—" : `${book.bitrateKbps} kbps`,
  },
];

function renderBookDetail(book: ScanReportBookRow) {
  return <BookDetail book={book} />;
}
