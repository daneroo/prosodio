/**
 * /lab/locate — the corpus sweep page (plan
 * thoughts/plans/bookplayer-locate-hardening.md, T2.3; decisions H4/H5). The
 * single-book sweep at lab.locate.$bookId.tsx runs the L3 locate sweep for
 * one book and auto-persists its report (T2.2); this page loops the whole
 * corpus in-page, sequentially, one book at a time, and persists each
 * finished report the same way. It replaces the need for any out-of-repo
 * driver script (Daniel's playwright-as-page-driver tool) — see the plan's
 * "How the sweep actually works" section.
 *
 * Dev-gated identically to lab.locate: import.meta.env.DEV is checked before
 * SweepCorpusPage mounts, so no hooks run and nothing fetches or imports
 * epubjs outside dev.
 *
 * The table itself renders through the shared LabTable shell
 * (components/lab/LabTable.tsx, plan thoughts/plans/lab-routes-refined.md,
 * S1b) — no behavior change from the page's own inline `<table>`.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { fetchArtifact } from "#/lib/alignment-client";
import { sweepBook } from "#/lib/locate-sweep";
import { fetchLibrary } from "#/server/library";
import { formatTimestamp } from "#/components/lab/format";
import { LabTable } from "#/components/lab/LabTable";
import type { SweepReport } from "#/lib/locate-sweep";
import type { BookRow } from "#/server/library";
import type { LabColumn } from "#/components/lab/LabTable";

export const Route = createFileRoute("/lab/locate/")({
  component: DevSweepRoute,
});

function DevSweepRoute() {
  if (!import.meta.env.DEV) {
    return (
      <p className="p-4 text-sm text-slate-400">Sweep page is dev-only.</p>
    );
  }
  return <SweepCorpusPage />;
}

type Totals = SweepReport["totals"];

/** One row's transient run status. Mirrors the run loop's stages exactly —
 * every state a book passes through between "not running" and "finished". */
type LiveState =
  | { status: "idle" }
  | { status: "queued" }
  | { status: "fetching-artifact" }
  | { status: "sweeping"; done: number; total: number; href: string }
  | { status: "saving" }
  | { status: "done"; totals: Totals }
  | { status: "error"; message: string }
  | { status: "unavailable" };

interface Row {
  id: string;
  title: string;
  /** Server-confirmed persisted result. Updated optimistically (local
   * timestamp) right after a successful PUT — see runOneBook. */
  stored: { generatedAt: string; totals: Totals } | null;
  /** Totals from the most recent sweep computed in THIS session, kept even
   * if the follow-up save fails — "keep report in row" per the plan, without
   * overloading LiveState's "error" variant with a totals field it doesn't
   * otherwise need. */
  liveTotals: Totals | null;
  live: LiveState;
}

interface SweepIndexEntry {
  bookId: string;
  generatedAt: string;
  totals: Totals;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

function mergeRows(
  books: Array<BookRow>,
  index: Array<SweepIndexEntry>,
): Array<Row> {
  const byId = new Map(index.map((entry) => [entry.bookId, entry]));
  return books
    .filter((book) => book.hasEpub && book.hasVtt)
    .map((book): Row => {
      const stored = byId.get(book.id);
      return {
        id: book.id,
        title: book.title,
        stored: stored
          ? { generatedAt: stored.generatedAt, totals: stored.totals }
          : null,
        liveTotals: null,
        live: { status: "idle" },
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function computeSummary(rows: Array<Row>) {
  let books = 0;
  let clean = 0;
  let partial = 0;
  let zeroOk = 0;
  let sections = 0;
  let tokens = 0;
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    const totals = row.liveTotals ?? row.stored?.totals ?? null;
    if (!totals) continue;
    books++;
    sections += totals.sections;
    tokens += totals.tokens;
    ok += totals.ok;
    failed += totals.failed;
    // zero-ok is a more specific case of "some failed" (ok 0, tokens > 0
    // implies failed === tokens > 0), so it's checked before the general
    // partial bucket.
    if (totals.failed === 0) clean++;
    else if (totals.ok === 0 && totals.tokens > 0) zeroOk++;
    else partial++;
  }
  return {
    books,
    clean,
    partial,
    zeroOk,
    totals: { sections, tokens, ok, failed },
  };
}

function SweepCorpusPage() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [rows, setRows] = useState<Array<Row>>([]);
  const [running, setRunning] = useState(false);

  const aliveRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;

    (async () => {
      setLoadState({ status: "loading" });
      try {
        const [library, sweepRes] = await Promise.all([
          fetchLibrary(),
          fetch("/api/locate-sweep", { signal: controller.signal }),
        ]);
        if (!aliveRef.current) return;
        const index: Array<SweepIndexEntry> = sweepRes.ok
          ? ((await sweepRes.json()) as Array<SweepIndexEntry>)
          : [];
        setRows(mergeRows(library.books, index));
        setLoadState({ status: "ready" });
      } catch (error) {
        if (!aliveRef.current) return;
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      aliveRef.current = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__sweepSummary =
      computeSummary(rows);
  }, [rows]);

  function updateRow(id: string, update: (row: Row) => Row) {
    if (!aliveRef.current) return;
    setRows((prev) => prev.map((row) => (row.id === id ? update(row) : row)));
  }

  async function runOneBook(id: string) {
    updateRow(id, (row) => ({ ...row, live: { status: "fetching-artifact" } }));

    // The artifact fetch can take minutes on a cold cache (the server
    // computes alignment on first request, then disk-caches it) — this
    // "fetching-artifact" status is the honest signal for that wait, not a
    // stall.
    let artifactResult;
    try {
      artifactResult = await fetchArtifact(id, controllerRef.current?.signal);
    } catch (error) {
      updateRow(id, (row) => ({
        ...row,
        live: {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      }));
      return;
    }

    if (artifactResult.status === "unavailable") {
      updateRow(id, (row) => ({ ...row, live: { status: "unavailable" } }));
      return;
    }

    updateRow(id, (row) => ({
      ...row,
      live: { status: "sweeping", done: 0, total: 0, href: "" },
    }));

    let report: SweepReport;
    try {
      report = await sweepBook(
        artifactResult.artifact,
        `/api/epub/${id}`,
        (done, total, href) => {
          updateRow(id, (row) => ({
            ...row,
            live: { status: "sweeping", done, total, href },
          }));
        },
      );
    } catch (error) {
      // A corpus run must not die on one book — record and move on.
      updateRow(id, (row) => ({
        ...row,
        live: {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      }));
      return;
    }

    updateRow(id, (row) => ({
      ...row,
      liveTotals: report.totals,
      live: { status: "saving" },
    }));

    try {
      const response = await fetch(`/api/locate-sweep/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report),
      });
      if (response.ok) {
        updateRow(id, (row) => ({
          ...row,
          stored: {
            generatedAt: new Date().toISOString(),
            totals: report.totals,
          },
          live: { status: "done", totals: report.totals },
        }));
      } else {
        updateRow(id, (row) => ({
          ...row,
          live: { status: "error", message: "save failed" },
        }));
      }
    } catch {
      updateRow(id, (row) => ({
        ...row,
        live: { status: "error", message: "save failed" },
      }));
    }
  }

  async function runBooks(ids: Array<string>) {
    if (running || ids.length === 0) return;
    cancelledRef.current = false;
    // A function accessor, not a raw boolean read: TS narrows the ref's
    // `.current` to a literal after the assignment above and won't re-widen
    // it across the loop's checks, even though `stop()` mutates it from a
    // separate closure between iterations (same reasoning as
    // lab.locate.$bookId.tsx's `isCancelled`).
    const isCancelled = () => cancelledRef.current;
    setRunning(true);
    const idSet = new Set(ids);
    setRows((prev) =>
      prev.map((row) =>
        idSet.has(row.id) ? { ...row, live: { status: "queued" } } : row,
      ),
    );

    for (const id of ids) {
      if (isCancelled()) break;
      await runOneBook(id);
    }

    if (aliveRef.current) {
      // Stopped before every queued book got its turn — revert the rest to
      // idle rather than leaving them stuck showing "queued".
      setRows((prev) =>
        prev.map((row) =>
          row.live.status === "queued"
            ? { ...row, live: { status: "idle" } }
            : row,
        ),
      );
      setRunning(false);
    }
  }

  const runAll = () => void runBooks(rows.map((row) => row.id));
  const runMissing = () =>
    void runBooks(rows.filter((row) => !row.stored).map((row) => row.id));
  const runRow = (id: string) => () => void runBooks([id]);
  const stop = () => {
    cancelledRef.current = true;
  };

  const summary = computeSummary(rows);

  return (
    <div className="p-4" data-testid="sweep-page">
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-sm font-medium text-slate-300">Sweep — corpus</h1>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={runAll}
          disabled={running || rows.length === 0}
          className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:text-white disabled:opacity-40"
        >
          Run all
        </button>
        <button
          type="button"
          onClick={runMissing}
          disabled={running || rows.every((row) => row.stored !== null)}
          className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:text-white disabled:opacity-40"
        >
          Run missing
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={!running}
          className="rounded border border-rose-800 px-2 py-1 text-xs text-rose-400 hover:text-rose-300 disabled:opacity-40"
        >
          Stop
        </button>
      </div>

      {loadState.status === "loading" && (
        <p className="text-xs text-slate-500">Loading library…</p>
      )}
      {loadState.status === "error" && (
        <p className="text-xs text-rose-400">
          Load failed: {loadState.message}
        </p>
      )}
      {loadState.status === "ready" && rows.length === 0 && (
        <p className="text-xs text-slate-500">
          No books with both EPUB and transcript.
        </p>
      )}
      {loadState.status === "ready" && rows.length > 0 && (
        <>
          <LabTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={buildColumns(running, runRow)}
            minWidthClassName="min-w-[820px]"
          />

          <p
            className="mt-3 text-xs tabular-nums text-slate-300"
            data-testid="sweep-totals"
          >
            {summary.books}/{rows.length} swept · clean {summary.clean} ·
            partial {summary.partial} · zero-ok {summary.zeroOk} · tokens{" "}
            {summary.totals.tokens} · ok {summary.totals.ok} · failed{" "}
            {summary.totals.failed}
          </p>
        </>
      )}
    </div>
  );
}

/** A row's totals: the live sweep just run in this session, falling back to
 * the last persisted report. Shared by several columns below. */
function rowTotals(row: Row): Totals | null {
  return row.liveTotals ?? row.stored?.totals ?? null;
}

/** Column defs for the sweep table — the old `SweepRow` component dissolved
 * into these once the table shell moved to LabTable. Built as a function
 * (not a module constant) so the run button can close over the current
 * `running` state and per-row run handler. */
function buildColumns(
  running: boolean,
  runRow: (id: string) => () => void,
): Array<LabColumn<Row>> {
  return [
    {
      header: "title",
      className: "max-w-[280px] truncate text-slate-300",
      cell: (row) => (
        <Link
          to="/lab/locate/$bookId"
          params={{ bookId: row.id }}
          className="underline hover:text-white"
        >
          {row.title}
        </Link>
      ),
    },
    {
      header: "sections",
      className: "tabular-nums text-slate-400",
      cell: (row) => rowTotals(row)?.sections ?? "—",
    },
    {
      header: "ok",
      className: "tabular-nums text-emerald-400",
      cell: (row) => rowTotals(row)?.ok ?? "—",
    },
    {
      header: "failed",
      className: "tabular-nums",
      cell: (row) => {
        const totals = rowTotals(row);
        return (
          <span
            className={
              totals && totals.failed > 0 ? "text-rose-400" : "text-slate-400"
            }
          >
            {totals ? totals.failed : "—"}
          </span>
        );
      },
    },
    {
      header: "tokens",
      className: "tabular-nums text-slate-400",
      cell: (row) => rowTotals(row)?.tokens ?? "—",
    },
    {
      header: "ok%",
      className: "tabular-nums text-slate-400",
      cell: (row) => {
        const totals = rowTotals(row);
        return totals && totals.tokens > 0
          ? `${((totals.ok / totals.tokens) * 100).toFixed(1)}%`
          : "—";
      },
    },
    {
      header: "generated",
      className: "text-slate-500",
      cell: (row) =>
        row.stored ? formatTimestamp(row.stored.generatedAt) : "—",
    },
    {
      header: "status",
      className: "max-w-[240px] truncate",
      cell: (row) => <LiveStatusLabel live={row.live} />,
    },
    {
      header: "",
      cell: (row) => (
        <button
          type="button"
          onClick={runRow(row.id)}
          disabled={running}
          className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300 hover:text-white disabled:opacity-40"
        >
          Run
        </button>
      ),
    },
  ];
}

function LiveStatusLabel({ live }: { live: LiveState }) {
  switch (live.status) {
    case "idle":
      return <span className="text-slate-600">{"—"}</span>;
    case "queued":
      return <span className="text-slate-500">queued</span>;
    case "fetching-artifact":
      return <span className="text-slate-400">computing alignment…</span>;
    case "sweeping":
      return (
        <span className="text-slate-400">
          sweeping {live.done}/{live.total} — {live.href}
        </span>
      );
    case "saving":
      return <span className="text-slate-400">saving…</span>;
    case "done":
      return <span className="text-emerald-400">saved</span>;
    case "error":
      return <span className="text-rose-400">error: {live.message}</span>;
    case "unavailable":
      return <span className="text-slate-500">no alignment</span>;
  }
}
