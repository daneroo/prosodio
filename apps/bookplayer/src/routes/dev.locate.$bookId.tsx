/**
 * L3 locate-coverage sweep page (plan
 * thoughts/plans/bookplayer-align-refine-model.md, T4.4). Dev-gated: this
 * page runs the real epub.js in the real browser against every matched EPUB
 * token in a book and reports whether it resolves to a working, round-
 * tripped epubcfi. Never wired into CI (it needs a browser + a served
 * book) — it's a manual triage tool, and doubles as the automation seam
 * `window.__locateSweepReport` for the orchestrator's browser verification.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { fetchArtifact } from "#/lib/alignment-client";
import { sweepBook } from "#/lib/locate-sweep";
import type { SweepReport, SweepSectionReport } from "#/lib/locate-sweep";

export const Route = createFileRoute("/dev/locate/$bookId")({
  component: DevLocateSweepRoute,
});

// Guards the sweep itself, not just its rendering: import.meta.env.DEV is
// checked before LocateSweepPage mounts, so no hooks run and no sweep starts
// outside dev — production bundles still ship this route (file-based
// routing has no per-route code-splitting toggle here), but it never fetches
// or imports epubjs when DEV is false.
function DevLocateSweepRoute() {
  if (!import.meta.env.DEV) {
    return (
      <p className="p-4 text-sm text-slate-400">Locate sweep is dev-only.</p>
    );
  }
  return <LocateSweepPage />;
}

type PageState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "sweeping" }
  | { status: "done"; report: SweepReport };

interface Progress {
  done: number;
  total: number;
  href: string;
}

function LocateSweepPage() {
  const { bookId } = Route.useParams();
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A function accessor, not a raw boolean read: TS narrows a captured
    // `let` to a literal after one `if (cancelled)` check and won't
    // re-widen it across further checks in the same closure, even across an
    // `await` (same reasoning as EpubReader.tsx's `alive()`).
    const isCancelled = () => cancelled;
    const controller = new AbortController();
    setState({ status: "loading" });
    setProgress(null);

    fetchArtifact(bookId, controller.signal)
      .then(async (result) => {
        if (isCancelled()) return;
        if (result.status === "unavailable") {
          setState({ status: "unavailable" });
          return;
        }
        setState({ status: "sweeping" });
        const report = await sweepBook(
          result.artifact,
          `/api/epub/${bookId}`,
          (done, total, href) => {
            if (!isCancelled()) setProgress({ done, total, href });
          },
        );
        if (isCancelled()) return;
        (window as unknown as Record<string, unknown>).__locateSweepReport =
          report;
        setState({ status: "done", report });
      })
      .catch((error: unknown) => {
        if (!isCancelled()) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bookId]);

  return (
    <div
      className="min-h-screen bg-slate-900 p-4 text-white"
      data-testid="locate-sweep"
    >
      <h1 className="mb-3 text-sm font-medium text-slate-300">
        Locate sweep — {bookId}
      </h1>
      {state.status === "loading" && (
        <p className="text-xs text-slate-500">Loading alignment…</p>
      )}
      {state.status === "unavailable" && (
        <p className="text-xs text-slate-500">
          No alignment for this book (needs both EPUB and transcript).
        </p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-rose-400">Sweep failed: {state.message}</p>
      )}
      {state.status === "sweeping" && (
        <p
          className="text-xs text-slate-400"
          data-testid="locate-sweep-progress"
        >
          {progress
            ? `Sweeping… ${progress.done}/${progress.total} — ${progress.href}`
            : "Sweeping…"}
        </p>
      )}
      {state.status === "done" && <SweepResults report={state.report} />}
    </div>
  );
}

function SweepResults({ report }: { report: SweepReport }) {
  const { totals } = report;
  return (
    <div>
      <p
        className="mb-3 text-xs tabular-nums text-slate-300"
        data-testid="locate-sweep-totals"
      >
        sections {totals.sections} · tokens {totals.tokens} · ok {totals.ok} ·
        failed {totals.failed}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-700 text-slate-500">
              <th className="py-1 pr-3 font-medium">href</th>
              <th className="py-1 pr-3 font-medium">parseMode</th>
              <th className="py-1 pr-3 font-medium">predicted</th>
              <th className="py-1 pr-3 font-medium">parity</th>
              <th className="py-1 pr-3 font-medium">ok/tokens</th>
              <th className="py-1 pr-3 font-medium">first failure</th>
            </tr>
          </thead>
          <tbody>
            {report.sections.map((section) => (
              <SectionRow key={section.href} section={section} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionRow({ section }: { section: SweepSectionReport }) {
  const modeMismatch =
    section.extensionPredictedMode !== "unknown" &&
    section.extensionPredictedMode !== section.parseMode;
  const first = section.failures[0];
  return (
    <tr className="border-b border-slate-800">
      <td className="max-w-[280px] truncate py-1 pr-3 text-slate-300">
        {section.href}
      </td>
      <td className="py-1 pr-3 text-slate-400">{section.parseMode}</td>
      <td
        className={`py-1 pr-3 ${modeMismatch ? "text-amber-400" : "text-slate-400"}`}
      >
        {section.extensionPredictedMode}
      </td>
      <td
        className={`py-1 pr-3 ${section.parity.ok ? "text-emerald-400" : "text-rose-400"}`}
      >
        {section.parity.ok
          ? `ok (${section.parity.segCount})`
          : `fail: ${section.parity.reason}`}
      </td>
      <td
        className={`py-1 pr-3 tabular-nums ${
          section.ok === section.tokens ? "text-emerald-400" : "text-rose-400"
        }`}
      >
        {section.ok}/{section.tokens}
      </td>
      <td className="py-1 pr-3 text-slate-500">
        {first ? `${first.step}@${first.epubSeq}` : "-"}
      </td>
    </tr>
  );
}
