/**
 * /lab/alignment — epub/vtt alignment surface (plan
 * thoughts/plans/lab-routes-refined.md, S4a; decisions D3/D4/D9/D10). Lists
 * every eligible epub/vtt pair with the coverage metrics already baked into
 * each artifact at align time (server/alignment-lab.ts plucks them from
 * cached JSON — this page never computes anything). Cache presence, size,
 * age, and schema version are always visible (D4); per-row and clear-all
 * eviction are one click away.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import {
  clearAlignmentArtifacts,
  evictAlignmentArtifact,
  fetchAlignmentIndex,
} from "#/server/alignment-lab";
import { formatBytes, formatTimestamp } from "#/components/lab/format";
import { LabTable } from "#/components/lab/LabTable";
import type { ReactNode } from "react";
import type {
  AlignmentListMetrics,
  AlignmentRow,
} from "#/server/alignment-lab";
import type { LabColumn } from "#/components/lab/LabTable";

export const Route = createFileRoute("/lab/alignment/")({
  component: AlignmentRoute,
});

function AlignmentRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">Alignment is dev-only.</p>;
  }
  return <AlignmentPage />;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

/** Which row (if any) currently has an action in flight, and what kind —
 *  mirrors the locate sweep page's `running` flag: only one action runs at
 *  a time, and every other Compute/Evict/Clear control disables meanwhile
 *  (a cold Compute can take minutes — see computeRow). */
type RowBusy = "computing" | "evicting" | null;

/** One decimal, matching AlignmentViewer's in-player metrics line. */
function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function mean(values: Array<number>): string {
  if (values.length === 0) return "—";
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return percent(avg);
}

function AlignmentPage() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [rows, setRows] = useState<Array<AlignmentRow>>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<RowBusy>(null);
  const [clearing, setClearing] = useState(false);
  const [actionError, setActionError] = useState<{
    label: string;
    message: string;
  } | null>(null);

  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  async function load() {
    setLoadState({ status: "loading" });
    try {
      const data = await fetchAlignmentIndex();
      if (!aliveRef.current) return;
      setRows(data.rows);
      setLoadState({ status: "ready" });
    } catch (error) {
      if (!aliveRef.current) return;
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function refetchRows() {
    const data = await fetchAlignmentIndex();
    if (aliveRef.current) setRows(data.rows);
  }

  const busy = busyId !== null || clearing;

  async function computeRow(row: AlignmentRow) {
    setActionError(null);
    setBusyId(row.id);
    setBusyKind("computing");
    try {
      // Triggers the server's compute-and-cache path (server/handlers/
      // alignment.ts -> loadOrComputeArtifact); a cold cache can take
      // minutes on a big book, hence "computing…" rather than a spinner
      // that implies seconds. The response body itself is unneeded here —
      // the row refresh below re-reads the freshly written cache.
      const res = await fetch(`/api/alignment/${row.id}`);
      if (!res.ok) {
        throw new Error(`compute failed: ${res.status} ${res.statusText}`);
      }
      await res.arrayBuffer();
      await refetchRows();
    } catch (error) {
      if (!aliveRef.current) return;
      setActionError({
        label: row.title,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (aliveRef.current) {
        setBusyId(null);
        setBusyKind(null);
      }
    }
  }

  async function evictRow(row: AlignmentRow) {
    setActionError(null);
    setBusyId(row.id);
    setBusyKind("evicting");
    try {
      await evictAlignmentArtifact({ data: row.id });
      await refetchRows();
    } catch (error) {
      if (!aliveRef.current) return;
      setActionError({
        label: row.title,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (aliveRef.current) {
        setBusyId(null);
        setBusyKind(null);
      }
    }
  }

  async function clearAll() {
    if (!window.confirm("Evict every cached alignment artifact?")) return;
    setActionError(null);
    setClearing(true);
    try {
      await clearAlignmentArtifacts();
      await refetchRows();
    } catch (error) {
      if (aliveRef.current) {
        setActionError({
          label: "Clear cache",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      if (aliveRef.current) setClearing(false);
    }
  }

  const cached = rows.filter((row) => row.cache !== null);
  const withMetrics = cached.filter((row) => row.cache?.metrics != null);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-sm font-medium text-slate-300">
          Alignment — epub/vtt pairs
        </h1>
        <button
          type="button"
          onClick={() => void clearAll()}
          disabled={busy || rows.length === 0}
          className="rounded border border-rose-800 px-2 py-1 text-xs text-rose-400 hover:text-rose-300 disabled:opacity-40"
        >
          Clear cache
        </button>
      </div>

      {loadState.status === "loading" && (
        <p className="text-xs text-slate-500">Loading…</p>
      )}
      {loadState.status === "error" && (
        <p className="text-xs text-rose-400">
          Load failed: {loadState.message}
        </p>
      )}
      {loadState.status === "ready" && (
        <>
          <p className="mb-3 text-xs tabular-nums text-slate-500">
            {rows.length} pairs · {cached.length} cached
            {withMetrics.length > 0 && (
              <>
                {" · narration "}
                {mean(
                  withMetrics.map((row) => row.cache!.metrics!.vttCoverage),
                )}
                {" · book "}
                {mean(
                  withMetrics.map((row) => row.cache!.metrics!.epubCoverage),
                )}
              </>
            )}
          </p>

          {rows.length === 0 ? (
            <p className="text-xs text-slate-500">
              No books with both an epub and a transcript.
            </p>
          ) : (
            <LabTable
              rows={rows}
              rowKey={(row) => row.id}
              columns={buildColumns(
                busyId,
                busyKind,
                clearing,
                computeRow,
                evictRow,
              )}
              minWidthClassName="min-w-[780px]"
            />
          )}

          {actionError && (
            <p className="mt-3 text-xs text-rose-400">
              {actionError.label} failed: {actionError.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** null (uncached), "unreadable" (cached but metrics failed to parse), or a
 *  rendered metric value — the three states every metrics column shares. */
function metricsCell(
  row: AlignmentRow,
  unreadableLabel: string,
  render: (metrics: AlignmentListMetrics) => string,
): ReactNode {
  if (!row.cache) return <span className="text-slate-600">—</span>;
  if (!row.cache.metrics) {
    return (
      <span className="text-rose-400" title="artifact JSON did not parse">
        {unreadableLabel}
      </span>
    );
  }
  return render(row.cache.metrics);
}

function CacheCell({ row }: { row: AlignmentRow }) {
  if (!row.cache) return <span className="text-slate-600">—</span>;
  const { bytes, mtimeMs, schemaVersion } = row.cache;
  return (
    <span className="tabular-nums text-slate-500">
      {formatBytes(bytes)} · {formatTimestamp(mtimeMs)}
      {schemaVersion !== null && (
        <span className="ml-1 text-slate-600">
          v<em>{schemaVersion}</em>
        </span>
      )}
    </span>
  );
}

function RowAction({
  row,
  busy,
  otherBusy,
  onCompute,
  onEvict,
}: {
  row: AlignmentRow;
  busy: RowBusy;
  otherBusy: boolean;
  onCompute: () => void;
  onEvict: () => void;
}) {
  if (busy === "computing") {
    return <span className="text-[11px] text-slate-400">computing…</span>;
  }
  if (busy === "evicting") {
    return <span className="text-[11px] text-slate-400">evicting…</span>;
  }
  const className =
    "rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300 hover:text-white disabled:opacity-40";
  return row.cache ? (
    <button
      type="button"
      onClick={onEvict}
      disabled={otherBusy}
      className={className}
    >
      Evict
    </button>
  ) : (
    <button
      type="button"
      onClick={onCompute}
      disabled={otherBusy}
      className={className}
    >
      Compute
    </button>
  );
}

function buildColumns(
  busyId: string | null,
  busyKind: RowBusy,
  clearing: boolean,
  computeRow: (row: AlignmentRow) => void | Promise<void>,
  evictRow: (row: AlignmentRow) => void | Promise<void>,
): Array<LabColumn<AlignmentRow>> {
  return [
    {
      header: "title",
      className: "max-w-[300px] truncate",
      cell: (row) => (
        <span className="truncate">
          <span className="text-slate-300">{row.title}</span>
          {row.author && (
            <span className="text-slate-500"> — {row.author}</span>
          )}
        </span>
      ),
    },
    {
      header: "narration",
      className: "tabular-nums text-slate-400",
      cell: (row) =>
        metricsCell(row, "unreadable artifact", (m) => percent(m.vttCoverage)),
    },
    {
      header: "book",
      className: "tabular-nums text-slate-400",
      cell: (row) => metricsCell(row, "—", (m) => percent(m.epubCoverage)),
    },
    {
      header: "spans",
      className: "tabular-nums text-slate-400",
      cell: (row) => metricsCell(row, "—", (m) => String(m.spanCount)),
    },
    {
      header: "gaps",
      className: "tabular-nums text-slate-400",
      cell: (row) => metricsCell(row, "—", (m) => String(m.gapCount)),
    },
    {
      header: "cache",
      cell: (row) => <CacheCell row={row} />,
    },
    {
      header: "",
      cell: (row) => (
        <RowAction
          row={row}
          busy={busyId === row.id ? busyKind : null}
          otherBusy={clearing || (busyId !== null && busyId !== row.id)}
          onCompute={() => void computeRow(row)}
          onEvict={() => void evictRow(row)}
        />
      ),
    },
  ];
}
