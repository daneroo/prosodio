import { createFileRoute } from "@tanstack/react-router";
import { BookOpenText } from "lucide-react";

import { fetchLibrary } from "#/server/library";

export const Route = createFileRoute("/")({
  loader: () => fetchLibrary(),
  component: Home,
});

// Interim shell over real library data; the full directory UX (search,
// filters, pagination, cards) lands in Phase 6.
function Home() {
  const { rootName, books, scanDurationMs } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-700 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <BookOpenText className="h-6 w-6 text-cyan-400" />
          <h1 className="text-xl font-bold tracking-tight">BookPlayer</h1>
          <span className="ml-auto text-xs text-slate-500 tabular-nums">
            {books.length} books · {rootName} · {scanDurationMs}ms
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <ul className="space-y-1 text-sm text-slate-300">
          {books.map((book) => (
            <li key={book.id}>
              <a
                href={`/player/${book.id}`}
                className="hover:text-white transition-colors"
              >
                {book.author ? `${book.author} — ` : ""}
                {book.title}
              </a>
            </li>
          ))}
        </ul>
        {books.length === 0 && (
          <p className="text-sm text-slate-500">
            No books found in the {rootName} root.
          </p>
        )}
      </main>
    </div>
  );
}
