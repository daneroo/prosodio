/**
 * /lab/corpora — corpus diagnostics surface (plan
 * thoughts/plans/lab-routes-refined.md, S2b; decisions D2/D2b/D9/D10). The
 * canonical replacement for the old per-line `[scan] warning` server-log
 * spam: scan findings (excluded candidates) and per-book epub/vtt basename
 * match quality both render here, backed by the `fetchScanReport` server fn
 * (src/server/library.ts, S2/S2a).
 *
 * Follows the lab.locate.index.tsx data-fetch shape (useEffect + alive
 * guard) and renders through the shared LabTable (D9's chevron-expand slot,
 * first real use here for the id/basename/relDir detail row — since
 * extracted to components/lab/BookDetail.tsx, along with MatchBadge and
 * formatBytes, for the S3 Audiobooks/Epub/VTT pages to reuse).
 */
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatDuration } from "#/lib/browse";
import { fetchScanReport, triggerRescan } from "#/server/library";
import { BookDetail } from "#/components/lab/BookDetail";
import { formatBytes, formatTimestamp } from "#/components/lab/format";
import { LabTable } from "#/components/lab/LabTable";
import { MatchBadge } from "#/components/lab/MatchBadge";
import type { ScanFinding, ScanFindingCode } from "@prosodio/corpus";
import type { ScanReportBookRow } from "#/server/library";
import type { LabColumn } from "#/components/lab/LabTable";

export const Route = createFileRoute("/lab/corpora/")({
  component: CorporaRoute,
});

function CorporaRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">Corpora is dev-only.</p>;
  }
  return <CorporaPage />;
}

type ScanReport = Awaited<ReturnType<typeof fetchScanReport>>;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ScanReport }
  | { status: "error"; message: string };

// Fixed display order for the summary line's per-code counts — stable
// regardless of scan/findings insertion order.
const FINDING_CODE_ORDER: Array<ScanFindingCode> = [
  "unreadable-dir",
  "multi-m4b",
  "no-cover",
  "duplicate-basename",
  "stray-file",
  "metadata-basename-fallback",
];

function findingCounts(
  findings: Array<ScanFinding>,
): Array<{ code: ScanFindingCode; count: number }> {
  const counts = new Map<ScanFindingCode, number>();
  for (const finding of findings) {
    counts.set(finding.code, (counts.get(finding.code) ?? 0) + 1);
  }
  return FINDING_CODE_ORDER.filter((code) => (counts.get(code) ?? 0) > 0).map(
    (code) => ({ code, count: counts.get(code) ?? 0 }),
  );
}

function isProblem(book: ScanReportBookRow): boolean {
  return (
    book.epubMatch === "near" ||
    book.epubMatch === "mismatch" ||
    book.vttMatch === "near" ||
    book.vttMatch === "mismatch"
  );
}

function CorporaPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [rescanning, setRescanning] = useState(false);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const aliveRef = useRef(true);

  async function load() {
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
  }

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const rescan = async () => {
    setRescanning(true);
    try {
      await triggerRescan();
      await load();
    } finally {
      if (aliveRef.current) setRescanning(false);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-300">
          Corpora — scan report
        </h2>
        <button
          type="button"
          onClick={() => void rescan()}
          disabled={rescanning}
          className="flex items-center gap-1.5 rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 transition-colors hover:text-white disabled:opacity-50"
          aria-label="Rescan library"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${rescanning ? "animate-spin" : ""}`}
          />
          {rescanning ? "Scanning…" : "Rescan"}
        </button>
      </div>

      {state.status === "loading" && (
        <p className="text-xs text-slate-500">Loading scan report…</p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-rose-400">Load failed: {state.message}</p>
      )}
      {state.status === "ready" && (
        <CorporaReport
          data={state.data}
          problemsOnly={problemsOnly}
          setProblemsOnly={setProblemsOnly}
        />
      )}
    </div>
  );
}

function CorporaReport({
  data,
  problemsOnly,
  setProblemsOnly,
}: {
  data: ScanReport;
  problemsOnly: boolean;
  setProblemsOnly: (value: boolean) => void;
}) {
  const counts = findingCounts(data.findings);
  const rows = problemsOnly ? data.books.filter(isProblem) : data.books;

  return (
    <>
      <p className="mb-3 text-xs tabular-nums text-slate-500">
        {data.books.length} books · {data.rootName} · scanned{" "}
        {formatTimestamp(data.scannedAt)}
        {counts.length > 0
          ? counts.map(({ code, count }) => ` · ${code} ${count}`).join("")
          : " · no findings"}
      </p>

      <label className="mb-3 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={problemsOnly}
          onChange={(e) => setProblemsOnly(e.target.checked)}
          className="accent-cyan-500"
        />
        Problems only
      </label>

      {data.books.length === 0 ? (
        <p className="text-xs text-slate-500">No books found.</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500">
          No books match the current filter.
        </p>
      ) : (
        <LabTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={BOOK_COLUMNS}
          renderDetail={renderBookDetail}
          minWidthClassName="min-w-[720px]"
        />
      )}

      {data.findings.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-slate-300">
            Findings — excluded candidates
          </h3>
          <LabTable
            rows={data.findings}
            rowKey={(finding) => `${finding.code}:${finding.relDir}`}
            columns={FINDING_COLUMNS}
            minWidthClassName="min-w-[600px]"
          />
        </div>
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
    header: "vtt",
    cell: (book) => <MatchBadge match={book.vttMatch} />,
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
];

function renderBookDetail(book: ScanReportBookRow) {
  return <BookDetail book={book} />;
}

const FINDING_COLUMNS: Array<LabColumn<ScanFinding>> = [
  {
    header: "code",
    cell: (finding) => (
      <span className="rounded bg-rose-900/60 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
        {finding.code}
      </span>
    ),
  },
  {
    header: "relDir",
    className: "max-w-[280px] truncate font-mono text-slate-300",
    cell: (finding) => finding.relDir,
  },
  {
    header: "detail",
    className: "text-slate-400",
    cell: (finding) => finding.detail,
  },
];
