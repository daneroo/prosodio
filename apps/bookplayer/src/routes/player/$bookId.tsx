import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/player/$bookId")({
  component: PlayerPage,
});

// Phase 1 placeholder: route exists and reads its param; the three-band
// player (reader, transcript, transport) lands in Phases 5-7.
function PlayerPage() {
  const { bookId } = Route.useParams();
  return (
    <div className="flex h-screen flex-col bg-slate-900 text-white">
      <header className="shrink-0 border-b border-slate-700 px-4 py-2">
        <Link to="/" className="text-sm text-slate-400 hover:text-white">
          &larr; Library
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-500">
          Player for book <span className="tabular-nums">{bookId}</span> — under
          construction.
        </p>
      </main>
    </div>
  );
}
