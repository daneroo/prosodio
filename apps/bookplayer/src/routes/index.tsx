import { createFileRoute } from "@tanstack/react-router";
import { BookOpenText } from "lucide-react";

import { fetchHealth } from "#/server/health";

export const Route = createFileRoute("/")({
  loader: () => fetchHealth({ data: "bookplayer" }),
  component: Home,
});

// Phase 1 shell: real server data flow, no fake library rows. The library
// directory replaces this in Phase 6.
function Home() {
  const health = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-700 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <BookOpenText className="h-6 w-6 text-cyan-400" />
          <h1 className="text-xl font-bold tracking-tight">BookPlayer</h1>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <p className="text-sm text-slate-400">
          Library directory arrives in Phase 6. Server round-trip:{" "}
          <span className="tabular-nums text-slate-300">
            {health.echo} @ {health.serverTime}
          </span>
        </p>
      </main>
    </div>
  );
}
