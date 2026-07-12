/**
 * /lab — layout route for the corpus inspection surfaces (plan
 * thoughts/plans/player-sync-core.md, S6/T1.2). Renders a slim header + tab
 * bar and an Outlet; the live "Locate" tab and its two pages
 * (lab.locate.index.tsx, lab.locate.$bookId.tsx) nest under this route via
 * TanStack's path-based file naming (`lab.locate.*` -> children of `lab`).
 * Align/Epub/Parsers are reserved placeholders — surfaces named in S6 but not
 * built yet.
 *
 * Dev-gated the same way as the two locate pages: import.meta.env.DEV is
 * checked before LabLayout mounts, so no hooks run and the Outlet's children
 * never get a chance to fetch outside dev.
 */
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/lab")({
  component: LabRoute,
});

function LabRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">Lab is dev-only.</p>;
  }
  return <LabLayout />;
}

const RESERVED_TABS = ["Align", "Epub", "Parsers"] as const;

function LabLayout() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-700 bg-slate-900/95 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-baseline gap-3">
          <h1 className="text-sm font-medium text-slate-300">Lab</h1>
          <p className="text-xs text-slate-500">corpus inspection surfaces</p>
          <a
            href="/"
            className="ml-auto text-xs text-slate-400 underline hover:text-slate-300"
          >
            library
          </a>
        </div>
        <nav className="mx-auto mt-2 flex max-w-7xl gap-1 text-xs">
          <Link
            to="/lab/locate"
            className="rounded px-2 py-1 text-slate-400 hover:text-white"
            activeProps={{ className: "bg-slate-800 text-cyan-400" }}
          >
            Locate
          </Link>
          {RESERVED_TABS.map((label) => (
            <span
              key={label}
              title="reserved"
              className="cursor-not-allowed rounded px-2 py-1 text-slate-600"
            >
              {label}
            </span>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
