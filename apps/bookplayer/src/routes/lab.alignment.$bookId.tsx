/**
 * /lab/alignment/$bookId — standalone alignment artifact inspector (plan
 * thoughts/plans/lab-routes-refined.md, S4b; decisions D1/D9/D10). Full-page,
 * read-only: renders straight off one cached artifact's `match.metrics` /
 * `match.gaps` (packages/align/src/metrics.ts, artifact.ts) — no audio, no
 * player chrome, no locate affordance. This is the "detail-view candidate"
 * D1 called out for Alignment specifically.
 *
 * Dev-gate, param handling, and the fetch idiom (useEffect + AbortController,
 * "unavailable" as a real render state rather than an error) are copied
 * exactly from lab.locate.$bookId.tsx, including reuse of fetchArtifact
 * (#/lib/alignment-client) — same contract the player uses.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { fetchArtifact } from "#/lib/alignment-client";
import { fetchBook } from "#/server/library";
import { LabTable } from "#/components/lab/LabTable";
import type { AlignmentArtifact } from "@prosodio/align/browser";
import type { LabColumn } from "#/components/lab/LabTable";

export const Route = createFileRoute("/lab/alignment/$bookId")({
  component: DevAlignmentDetailRoute,
});

// Guards the fetch itself, not just rendering — mirrors lab.locate.$bookId.tsx:
// import.meta.env.DEV is checked before AlignmentDetailPage mounts, so no
// hooks run and nothing fetches outside dev.
function DevAlignmentDetailRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">Alignment is dev-only.</p>;
  }
  return <AlignmentDetailPage />;
}

type Metrics = AlignmentArtifact["match"]["metrics"];
type PassRow = Metrics["passes"][number];
type SpineRow = Metrics["spines"][number];
type GapEntry = AlignmentArtifact["match"]["gaps"][number];

type PageState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "ready"; artifact: AlignmentArtifact; title: string };

function AlignmentDetailPage() {
  const { bookId } = Route.useParams();
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    // A function accessor, not a raw boolean read: TS narrows a captured
    // `let` to a literal after one `if (cancelled)` check and won't
    // re-widen it across further checks in the same closure, even across an
    // `await` (same reasoning as lab.locate.$bookId.tsx's `isCancelled`).
    const isCancelled = () => cancelled;
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchArtifact(bookId, controller.signal)
      .then(async (result) => {
        if (isCancelled()) return;
        if (result.status === "unavailable") {
          setState({ status: "unavailable" });
          return;
        }
        // Title is cosmetic only (header text) — a failed/invalid lookup
        // still renders the artifact, falling back to the raw bookId.
        let title = bookId;
        try {
          const book = await fetchBook({ data: bookId });
          if (!isCancelled()) title = book.title;
        } catch {
          // tolerate: header falls back to bookId
        }
        if (isCancelled()) return;
        setState({ status: "ready", artifact: result.artifact, title });
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
    <div className="p-4" data-testid="alignment-detail">
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-sm font-medium text-slate-300">
          Alignment — {state.status === "ready" ? state.title : bookId}
        </h1>
        <a
          href="/lab/alignment"
          className="text-xs text-slate-400 underline hover:text-slate-300"
        >
          all pairs
        </a>
      </div>
      {state.status === "loading" && (
        <p className="text-xs text-slate-500">Loading alignment…</p>
      )}
      {state.status === "unavailable" && (
        <p className="text-xs text-slate-500">
          No alignment for this book (needs both EPUB and transcript).
        </p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-rose-400">Load failed: {state.message}</p>
      )}
      {state.status === "ready" && <ArtifactReport artifact={state.artifact} />}
    </div>
  );
}

function ArtifactReport({ artifact }: { artifact: AlignmentArtifact }) {
  const { metrics, gaps } = artifact.match;
  return (
    <>
      <MetricsLine metrics={metrics} />

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-slate-300">Passes</h2>
        <LabTable
          rows={metrics.passes}
          rowKey={(row) => row.passId}
          columns={PASS_COLUMNS}
          minWidthClassName="min-w-[480px]"
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-slate-300">Spines</h2>
        <LabTable
          rows={metrics.spines}
          rowKey={(row) => String(row.spineIndex)}
          columns={SPINE_COLUMNS}
          minWidthClassName="min-w-[640px]"
        />
      </section>

      <GapsSection gaps={gaps} />
    </>
  );
}

/** Exactly AlignmentViewer's in-player format (AlignmentViewer.tsx ~line
 *  142/335) — narration/book coverage rounded to a whole percent — extended
 *  with matched/total token counts for both sides. */
function playerPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** One decimal — matches the list page's `percent()`
 *  (lab.alignment.index.tsx), used here for the finer-grained per-row
 *  survival/match ratios. */
function percent1(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function MetricsLine({ metrics }: { metrics: Metrics }) {
  return (
    <p className="mb-4 text-xs tabular-nums text-slate-400">
      narration {playerPercent(metrics.vttCoverage)} · book{" "}
      {playerPercent(metrics.epubCoverage)} · {metrics.spanCount} spans ·{" "}
      {metrics.gapCount} gaps · vtt {metrics.vttMatchedTokens}/
      {metrics.vttTokens} tokens · epub {metrics.epubMatchedTokens}/
      {metrics.epubTokens} tokens
    </p>
  );
}

const PASS_COLUMNS: Array<LabColumn<PassRow>> = [
  { header: "pass", className: "text-slate-300", cell: (row) => row.passId },
  {
    header: "candidates",
    className: "tabular-nums text-slate-400",
    cell: (row) => row.candidates,
  },
  {
    header: "selected",
    className: "tabular-nums text-slate-400",
    cell: (row) => row.selected,
  },
  {
    header: "survival",
    className: "tabular-nums text-slate-400",
    cell: (row) => percent1(row.survivalRate),
  },
  {
    header: "accepted spans",
    className: "tabular-nums text-slate-400",
    cell: (row) => row.acceptedSpans,
  },
];

const SPINE_COLUMNS: Array<LabColumn<SpineRow>> = [
  {
    header: "index",
    className: "tabular-nums text-slate-500",
    cell: (row) => row.spineIndex,
  },
  {
    header: "href",
    className: "max-w-[360px] truncate font-mono text-slate-300",
    cell: (row) => row.spineHref,
  },
  {
    header: "tokens",
    className: "tabular-nums text-slate-400",
    cell: (row) => row.tokens,
  },
  {
    header: "matched",
    className: "tabular-nums text-slate-400",
    cell: (row) => row.matchedTokens,
  },
  {
    header: "ratio",
    className: "tabular-nums text-slate-400",
    cell: (row) => percent1(row.matchRatio),
  },
  {
    header: "anchor spans",
    className: "tabular-nums text-slate-400",
    cell: (row) => row.anchorSpans,
  },
  { header: "flags", cell: (row) => <SpineFlags spine={row} /> },
];

function SpineFlags({ spine }: { spine: SpineRow }) {
  if (spine.zeroMatch) {
    return (
      <span className="rounded bg-rose-900/60 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
        zero
      </span>
    );
  }
  if (spine.lowMatch) {
    return (
      <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
        low
      </span>
    );
  }
  return <span className="text-slate-600">—</span>;
}

/** Denormalized once per gap (plan-required columns: token counts derived
 *  from the half-open ranges, plus the ranges themselves) so filter/sort
 *  don't recompute on every render — see the GapsSection memoization
 *  below. `index` is the gap's position in `artifact.match.gaps`, kept
 *  stable across filtering/sorting as a cross-reference key. */
interface GapRowView {
  index: number;
  vttTokens: number;
  epubTokens: number;
  vttStart: number;
  vttEnd: number;
  epubStart: number;
  epubEnd: number;
}

/** D9/D10: no virtualization for the gaps table — cap rendering instead,
 *  same "totals + capped sample" discipline as the locate sweep report. */
const GAP_ROW_CAP = 500;

const GAP_COLUMNS: Array<LabColumn<GapRowView>> = [
  {
    header: "#",
    className: "tabular-nums text-slate-500",
    cell: (row) => row.index,
  },
  {
    header: "vtt tokens",
    className: "tabular-nums text-slate-400",
    cell: (row) => row.vttTokens,
  },
  {
    header: "epub tokens",
    className: "tabular-nums text-slate-400",
    cell: (row) => row.epubTokens,
  },
  {
    header: "vtt range",
    className: "tabular-nums text-slate-500",
    cell: (row) => `${row.vttStart}–${row.vttEnd}`,
  },
  {
    header: "epub range",
    className: "tabular-nums text-slate-500",
    cell: (row) => `${row.epubStart}–${row.epubEnd}`,
  },
];

function GapsSection({ gaps }: { gaps: ReadonlyArray<GapEntry> }) {
  const [minEpubTokens, setMinEpubTokens] = useState(0);

  const rows = useMemo<Array<GapRowView>>(
    () =>
      gaps.map((gap, index) => ({
        index,
        vttTokens: gap.vttEnd - gap.vttStart,
        epubTokens: gap.epubEnd - gap.epubStart,
        vttStart: gap.vttStart,
        vttEnd: gap.vttEnd,
        epubStart: gap.epubStart,
        epubEnd: gap.epubEnd,
      })),
    [gaps],
  );

  // The payoff view: book content the narration never reads (and vice
  // versa), biggest first.
  const filtered = useMemo(
    () =>
      rows
        .filter((row) => row.epubTokens >= minEpubTokens)
        .sort((a, b) => b.epubTokens - a.epubTokens),
    [rows, minEpubTokens],
  );

  const capped = filtered.length > GAP_ROW_CAP;
  const visible = capped ? filtered.slice(0, GAP_ROW_CAP) : filtered;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-slate-300">Gaps</h2>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          min epub tokens
          <input
            type="number"
            min={0}
            value={minEpubTokens}
            onChange={(event) =>
              setMinEpubTokens(Math.max(0, Number(event.target.value) || 0))
            }
            className="w-16 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-xs tabular-nums text-slate-200"
          />
        </label>
      </div>

      {capped && (
        <p className="mb-2 text-[11px] text-slate-500">
          showing {GAP_ROW_CAP} of {filtered.length}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-xs text-slate-500">
          No gaps match the current filter.
        </p>
      ) : (
        <LabTable
          rows={visible}
          rowKey={(row) => String(row.index)}
          columns={GAP_COLUMNS}
          minWidthClassName="min-w-[560px]"
        />
      )}
    </section>
  );
}
