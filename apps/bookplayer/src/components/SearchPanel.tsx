/**
 * Reader-pane search overlay (plan player-sync-core T2.4 / S7): the
 * full-width result-list panel and the collapsed mini-pager that replaces it
 * once a result is active. Anchored to the reader pane — the parent must be
 * `position: relative` — rather than the whole page, so it visually belongs
 * to the reader. Free of alignment/sync knowledge beyond the optional
 * follow-disengage flag on `onGotoResult`, which the route decides how to
 * honor.
 */
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { FormEvent } from "react";

import type { SearchState } from "#/components/EpubReader";

interface GotoResultOpts {
  disengageFollow?: boolean;
}

interface SearchPanelProps {
  panelOpen: boolean;
  searchState: SearchState;
  queryInput: string;
  onQueryInput: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  onGotoResult: (index: number, opts?: GotoResultOpts) => void;
  onShowResults: () => void;
}

export function SearchPanel({
  panelOpen,
  searchState,
  queryInput,
  onQueryInput,
  onSubmit,
  onClose,
  onGotoResult,
  onShowResults,
}: SearchPanelProps) {
  const { results, activeIndex, searching, query } = searchState;
  // After a result is chosen the panel collapses to a mini-pager, so the
  // results stay actionable without an overlay eating the reader.
  const showResultList = panelOpen && activeIndex === null;

  return (
    <>
      {showResultList && (
        <div className="absolute inset-x-0 top-0 z-20 max-h-[45vh] overflow-y-auto border-b border-slate-700 bg-slate-900/95 p-2 shadow-xl backdrop-blur-sm sm:left-auto sm:right-2 sm:w-96 sm:rounded-b-lg sm:border-x">
          <form onSubmit={onSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={queryInput}
              onChange={(e) => onQueryInput(e.target.value)}
              placeholder="Search this book…"
              className="min-w-0 flex-1 rounded bg-slate-700 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded bg-cyan-700 px-2.5 py-1.5 text-sm text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {searching ? "…" : "Go"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white"
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </button>
          </form>
          {query && !searching && (
            <p className="px-1 pt-2 text-[11px] text-slate-500">
              {results.length === 0
                ? `No results for "${query}"`
                : `${results.length}${results.length >= 100 ? "+" : ""} results`}
            </p>
          )}
          {results.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {results.map((result, index) => (
                <li key={result.cfi}>
                  <button
                    type="button"
                    onClick={() =>
                      onGotoResult(index, { disengageFollow: true })
                    }
                    className="block w-full truncate rounded px-2 py-1 text-left text-xs text-slate-300 transition-colors hover:bg-slate-700"
                  >
                    {result.excerpt}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {panelOpen && activeIndex !== null && (
        <div className="absolute right-2 top-0 z-20 flex items-center gap-1 rounded-b-lg border border-t-0 border-slate-700 bg-slate-900/95 px-2 py-1 shadow-xl backdrop-blur-sm">
          <span className="text-xs tabular-nums text-slate-400">
            {activeIndex + 1}/{results.length}
          </span>
          <button
            type="button"
            onClick={() => onGotoResult(Math.max(activeIndex - 1, 0))}
            className="p-1 text-slate-400 hover:text-white"
            aria-label="Previous result"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              onGotoResult(Math.min(activeIndex + 1, results.length - 1))
            }
            className="p-1 text-slate-400 hover:text-white"
            aria-label="Next result"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onShowResults}
            className="px-1 text-xs text-slate-400 hover:text-white"
          >
            results
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
