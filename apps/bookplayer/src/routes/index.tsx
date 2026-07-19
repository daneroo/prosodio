import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { BookOpenText, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  applyFilters,
  compareBy,
  formatDuration,
  searchRows,
} from "#/lib/browse";
import { fetchLibrary, triggerRescan } from "#/server/library";
import type { SortKey } from "#/lib/browse";
import type { BookRow } from "#/server/library";

export const Route = createFileRoute("/")({
  loader: () => fetchLibrary(),
  pendingComponent: LoadingState,
  errorComponent: ErrorState,
  component: Home,
});

const BOOKS_PER_PAGE = 24;
const FILTERS_KEY = "bookplayer:filters";

interface Filters {
  epub: boolean;
  vtt: boolean;
}

// Seed contract: both capability filters default ON.
const DEFAULT_FILTERS: Filters = { epub: true, vtt: true };

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<Filters>;
    return {
      epub: typeof parsed.epub === "boolean" ? parsed.epub : true,
      vtt: typeof parsed.vtt === "boolean" ? parsed.vtt : true,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function Home() {
  const data = Route.useLoaderData();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("title");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [rescanning, setRescanning] = useState(false);
  // Client-only bits (localStorage) load after hydration.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setFilters(loadFilters());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      /* persistence is best-effort */
    }
  }, [filters, hydrated]);

  const filtered = useMemo(
    () =>
      [...searchRows(applyFilters(data.books, filters), search)].sort(
        compareBy(sort),
      ),
    [data.books, filters, search, sort],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / BOOKS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    safePage * BOOKS_PER_PAGE,
    (safePage + 1) * BOOKS_PER_PAGE,
  );

  const rescan = async () => {
    setRescanning(true);
    try {
      await triggerRescan();
      await router.invalidate();
    } finally {
      setRescanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <BookOpenText className="h-6 w-6 shrink-0 text-cyan-400" />
          <h1 className="text-xl font-bold tracking-tight">BookPlayer</h1>
          {import.meta.env.DEV && (
            <a
              href="/lab"
              className="text-xs text-slate-400 underline hover:text-slate-300"
            >
              lab
            </a>
          )}
          <span className="ml-auto text-xs tabular-nums text-slate-500">
            {filtered.length}/{data.books.length} books · {data.rootName} ·{" "}
            {data.scanDurationMs}ms
            {data.warningCount > 0 && ` · ${data.warningCount} warnings`}
          </span>
          <button
            type="button"
            onClick={() => void rescan()}
            disabled={rescanning || data.scanning}
            className="flex items-center gap-1.5 rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 transition-colors hover:text-white disabled:opacity-50"
            aria-label="Rescan library"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${rescanning ? "animate-spin" : ""}`}
            />
            {rescanning ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {/* Search / sort / capability filters */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search by title or author…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-10 pr-9 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(0);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              Sort
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortKey);
                  setPage(0);
                }}
                className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-cyan-500"
              >
                <option value="title">Title</option>
                <option value="author">Author</option>
                <option value="duration">Duration</option>
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={filters.epub}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, epub: e.target.checked }));
                  setPage(0);
                }}
                className="accent-cyan-500"
              />
              EPUB
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={filters.vtt}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, vtt: e.target.checked }));
                  setPage(0);
                }}
                className="accent-cyan-500"
              />
              VTT
            </label>
          </div>
        </div>

        {data.books.length === 0 ? (
          <div className="py-16 text-center">
            <BookOpenText className="mx-auto mb-3 h-12 w-12 text-slate-700" />
            <p className="text-sm text-slate-400">
              No books found in the <b>{data.rootName}</b> root.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              A book directory needs one .m4b plus cover.jpg or cover.png.
              Switch roots with BOOKPLAYER_ROOT=fixtures|private in
              apps/bookplayer/.env.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-400">
              No books match the current search/filters.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Uncheck EPUB/VTT or clear the search to see all{" "}
              {data.books.length} books.
            </p>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {pageRows.map((book) => (
                <BookCard key={book.id} book={book} hydrated={hydrated} />
              ))}
            </ul>
            {totalPages > 1 && (
              <nav
                className="mt-6 flex items-center justify-center gap-3"
                aria-label="Pagination"
              >
                <button
                  type="button"
                  onClick={() => setPage(Math.max(safePage - 1, 0))}
                  disabled={safePage === 0}
                  className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 transition-colors hover:text-white disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-xs tabular-nums text-slate-500">
                  {safePage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage(Math.min(safePage + 1, totalPages - 1))
                  }
                  disabled={safePage >= totalPages - 1}
                  className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 transition-colors hover:text-white disabled:opacity-40"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function BookCard({ book, hydrated }: { book: BookRow; hydrated: boolean }) {
  const progress = hydrated ? loadProgress(book.id) : null;
  return (
    <li>
      <Link
        to="/player/$bookId"
        params={{ bookId: book.id }}
        className="group block overflow-hidden rounded-lg border border-slate-700 bg-slate-800 transition-colors hover:border-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-500"
      >
        <CoverImage bookId={book.id} />
        <div className="p-2.5">
          <p className="truncate text-sm font-medium text-white">
            {book.title}
          </p>
          <p className="truncate text-xs text-slate-400">
            {book.author ?? " "}
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-slate-500">
            {formatDuration(book.durationSec)} ·{" "}
            {progress !== null
              ? `at ${formatDuration(progress)}`
              : "Not started"}
          </p>
          <div className="mt-1.5 flex gap-1">
            <Badge label="M4B" tone="slate" />
            {book.hasEpub && <Badge label="EPUB" tone="cyan" />}
            {book.hasVtt && <Badge label="VTT" tone="emerald" />}
          </div>
        </div>
      </Link>
    </li>
  );
}

// Bounded retry: the vite dev server can 404 image-destination requests
// that arrive before the server-route manifest compiles (cold start);
// production is unaffected (verified). The mount check covers failures that
// happen before hydration attaches onError to the SSR-rendered img.
function CoverImage({ bookId }: { bookId: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((a) => (a < 2 ? a + 1 : a));
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) retry();
  }, [attempt]);
  return (
    <img
      ref={imgRef}
      src={`/api/cover/${bookId}${attempt > 0 ? `?retry=${attempt}` : ""}`}
      alt=""
      loading="lazy"
      onError={retry}
      className="aspect-square w-full bg-slate-700 object-cover"
    />
  );
}

function loadProgress(bookId: string): number | null {
  try {
    const raw = localStorage.getItem(`bookplayer:${bookId}:audio`);
    if (!raw) return null;
    const sec = Number.parseFloat(raw);
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  } catch {
    return null;
  }
}

function Badge({ label, tone }: { label: string; tone: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-700 text-slate-400",
    cyan: "bg-cyan-900/60 text-cyan-400",
    emerald: "bg-emerald-900/60 text-emerald-400",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tones[tone] ?? tones.slate}`}
    >
      {label}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-700 px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <BookOpenText className="h-6 w-6 text-cyan-400" />
          <h1 className="text-xl font-bold tracking-tight">BookPlayer</h1>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <p className="animate-pulse text-sm text-slate-400">
          Scanning library…
        </p>
      </main>
    </div>
  );
}

function ErrorState({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-700 px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <BookOpenText className="h-6 w-6 text-cyan-400" />
          <h1 className="text-xl font-bold tracking-tight">BookPlayer</h1>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10 text-center">
        <p className="mb-2 text-sm text-red-400">Library scan failed</p>
        <p className="mx-auto mb-4 max-w-xl text-xs text-slate-500">
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => void router.invalidate()}
          className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
        >
          Retry
        </button>
      </main>
    </div>
  );
}
