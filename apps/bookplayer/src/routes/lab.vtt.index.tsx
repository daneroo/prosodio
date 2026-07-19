/**
 * /lab/vtt — transcripts with cue counts and span durations (plan
 * thoughts/plans/lab-routes-refined.md, S3; decisions D1/D2b/D9/D10). Rows
 * cover both exact and near vtt matches — a near row is a real file that
 * failed exact basename pairing, and is evidence worth showing here (the
 * Corpora tab is where the pairing itself gets fixed). Cue metrics are
 * computed on request per row (LabTable's chevron-expand, D9), reusing the
 * existing `fetchTranscript` server fn (src/server/library.ts) rather than
 * adding new server state.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { formatDuration } from "#/lib/browse";
import { fetchScanReport, fetchTranscript } from "#/server/library";
import { LabTable } from "#/components/lab/LabTable";
import { MatchBadge } from "#/components/lab/MatchBadge";
import type { ScanReportBookRow } from "#/server/library";
import type { LabColumn } from "#/components/lab/LabTable";

export const Route = createFileRoute("/lab/vtt/")({
  component: VttRoute,
});

function VttRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">VTT is dev-only.</p>;
  }
  return <VttPage />;
}

type ScanReport = Awaited<ReturnType<typeof fetchScanReport>>;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ScanReport }
  | { status: "error"; message: string };

function VttPage() {
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
        VTT — transcripts with cue counts and span durations
      </h2>

      {state.status === "loading" && (
        <p className="text-xs text-slate-500">Loading scan report…</p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-rose-400">Load failed: {state.message}</p>
      )}
      {state.status === "ready" && <VttReport data={state.data} />}
    </div>
  );
}

function VttReport({ data }: { data: ScanReport }) {
  const rows = data.books.filter((book) => book.vttMatch !== "absent");
  const exact = rows.filter((book) => book.vttMatch === "exact").length;
  const near = rows.filter((book) => book.vttMatch === "near").length;

  return (
    <>
      <p className="mb-3 text-xs tabular-nums text-slate-500">
        {rows.length} transcripts · exact {exact} · near {near}
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">No transcripts found.</p>
      ) : (
        <LabTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={BOOK_COLUMNS}
          renderDetail={renderVttDetail}
          minWidthClassName="min-w-[520px]"
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
    header: "vtt",
    cell: (book) => <MatchBadge match={book.vttMatch} />,
  },
];

function renderVttDetail(book: ScanReportBookRow) {
  return <VttDetail book={book} />;
}

type CueState =
  | { status: "loading" }
  | { status: "ready"; cueCount: number; spanSec: number }
  | { status: "error"; message: string };

/** Fetches cue metrics on mount — LabTable only mounts this when the row's
 * chevron is expanded, so this doubles as "compute on request". Near rows
 * never pair with an exact vtt file, so there is nothing to fetch. */
function VttDetail({ book }: { book: ScanReportBookRow }) {
  const [state, setState] = useState<CueState>({ status: "loading" });
  const aliveRef = useRef(true);

  useEffect(() => {
    if (book.vttMatch === "near") return;
    aliveRef.current = true;
    void (async () => {
      try {
        const { cues } = await fetchTranscript({ data: book.id });
        if (!aliveRef.current) return;
        const first = cues?.[0];
        const last = cues?.[cues.length - 1];
        if (!first || !last) {
          setState({ status: "ready", cueCount: 0, spanSec: 0 });
          return;
        }
        setState({
          status: "ready",
          cueCount: cues.length,
          spanSec: last.endSec - first.startSec,
        });
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
  }, [book.id, book.vttMatch]);

  if (book.vttMatch === "near") {
    return (
      <p className="text-xs text-slate-500">
        near match — not paired (see corpora)
      </p>
    );
  }
  if (state.status === "loading") {
    return <p className="text-xs text-slate-500">loading…</p>;
  }
  if (state.status === "error") {
    return <p className="text-xs text-rose-400">{state.message}</p>;
  }
  return (
    <p className="text-xs tabular-nums text-slate-400">
      cues {state.cueCount} · span {formatDuration(state.spanSec)}
    </p>
  );
}
