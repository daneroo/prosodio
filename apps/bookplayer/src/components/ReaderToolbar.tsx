/**
 * Slim toolbar for the reader pane (plan player-sync-core T2.4): Chapters
 * select, prev/next pager, search open/close toggle. Colocated with the EPUB
 * view instead of the global top bar so the reader pane is self-contained.
 * Deliberately free of alignment/sync knowledge — it only drives the
 * `ReaderController` and the search-panel open flag; the route still owns
 * `followReader` and passes down the disengage callback.
 */
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import type { ReaderController, TocItem } from "#/components/EpubReader";

interface ReaderToolbarProps {
  toc: Array<TocItem>;
  controller: ReaderController | null;
  panelOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onDisengageFollow: () => void;
}

export function ReaderToolbar({
  toc,
  controller,
  panelOpen,
  onOpenSearch,
  onCloseSearch,
  onDisengageFollow,
}: ReaderToolbarProps) {
  return (
    <div className="relative z-10 flex shrink-0 items-center justify-end gap-2 border-b border-slate-700 bg-slate-900 px-3 py-2">
      {toc.length > 0 && (
        <select
          aria-label="Chapters"
          className="max-w-36 truncate rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:max-w-52"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onDisengageFollow();
              controller?.goTo(e.target.value);
            }
            e.target.value = "";
          }}
        >
          <option value="" disabled>
            Chapters…
          </option>
          {toc.map((item) => (
            <option key={item.href} value={item.href}>
              {item.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={() => {
          onDisengageFollow();
          controller?.prev();
        }}
        className="p-1 text-slate-400 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          onDisengageFollow();
          controller?.next();
        }}
        className="p-1 text-slate-400 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500"
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => (panelOpen ? onCloseSearch() : onOpenSearch())}
        className="p-1 text-slate-400 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500"
        aria-label={panelOpen ? "Close search" : "Search book"}
      >
        {panelOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
      </button>
    </div>
  );
}
