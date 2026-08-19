/**
 * Slim toolbar for the reader pane (plan player-sync-core T2.4): theme
 * cycle, font cycle, Chapters select, prev/next pager, search open/close
 * toggle (plan T2 adds the first two). Colocated with the EPUB view instead
 * of the global top bar so the reader pane is self-contained. Deliberately
 * free of alignment/sync knowledge — it only drives the `ReaderController`
 * and the search-panel open flag; the route still owns `followReader` and
 * passes down the disengage callback, and it owns the theme/font state and
 * cycling logic too (this component just renders current state and calls
 * the cycle callbacks — same "dumb" contract, design §6 decision 7).
 */
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Moon,
  Search,
  Sun,
  Type,
  X,
} from "lucide-react";

import { FONT_LABELS } from "#/components/EpubReader";
import type {
  FontName,
  ReaderController,
  ThemeName,
  TocItem,
} from "#/components/EpubReader";

interface ReaderToolbarProps {
  toc: Array<TocItem>;
  controller: ReaderController | null;
  panelOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onDisengageFollow: () => void;
  /** Current reading theme (plan T2) — book default -> light -> dark. */
  theme: ThemeName;
  onCycleTheme: () => void;
  /** Current reading font (plan T2) — Iowan -> Charter -> Georgia. */
  font: FontName;
  onCycleFont: () => void;
}

// Icon + label per theme state (design §6 decision 7): the icon alone shows
// state at a glance (matches the follow/align toggle idiom in $bookId.tsx),
// the aria-label spells it out for accessibility. Daniel is on an iPad with
// no tooltip, so both need to carry the state, not just the icon.
const THEME_DISPLAY: Record<
  ThemeName,
  { Icon: typeof BookOpenText; label: string }
> = {
  default: { Icon: BookOpenText, label: "Reading theme: book default" },
  light: { Icon: Sun, label: "Reading theme: light" },
  dark: { Icon: Moon, label: "Reading theme: dark" },
};

export function ReaderToolbar({
  toc,
  controller,
  panelOpen,
  onOpenSearch,
  onCloseSearch,
  onDisengageFollow,
  theme,
  onCycleTheme,
  font,
  onCycleFont,
}: ReaderToolbarProps) {
  const { Icon: ThemeIcon, label: themeLabel } = THEME_DISPLAY[theme];
  return (
    <div className="relative z-10 flex shrink-0 items-center justify-end gap-2 border-b border-slate-700 bg-slate-900 px-3 py-2">
      <button
        type="button"
        onClick={onCycleTheme}
        className={`p-1 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500 ${
          theme === "default" ? "text-slate-400" : "text-cyan-400"
        }`}
        aria-label={`${themeLabel} — tap to cycle`}
      >
        <ThemeIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onCycleFont}
        disabled={theme === "default"}
        className="flex items-center gap-1 p-1 text-slate-400 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:text-slate-600 disabled:hover:text-slate-600"
        aria-label={
          theme === "default"
            ? "Reading font: the book's own — pick light or dark to override it"
            : `Reading font: ${FONT_LABELS[font]} — tap to cycle`
        }
      >
        <Type className="h-4 w-4" />
        {/* Under book default no font override is applied (design §6
            decision 2), so showing the stored face would claim something the
            page isn't doing — say "Book" and disable the control instead. The
            stored preference is untouched and comes back on light/dark. */}
        <span className="text-xs">
          {theme === "default" ? "Book" : FONT_LABELS[font]}
        </span>
      </button>
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
