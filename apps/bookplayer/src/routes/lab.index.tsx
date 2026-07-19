/**
 * /lab landing page — lite index explaining the tab bar (plan
 * thoughts/plans/player-sync-core.md, S6/T1.2). One card per surface; Locate
 * is live and links out, the other three are reserved placeholders matching
 * lab.tsx's disabled tabs.
 *
 * Dev-gated the same way as lab.tsx and the two locate pages.
 */
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/lab/")({
  component: LabIndexRoute,
});

function LabIndexRoute() {
  if (!import.meta.env.DEV) {
    return <p className="p-4 text-sm text-slate-400">Lab is dev-only.</p>;
  }
  return <LabIndexPage />;
}

interface SurfaceCard {
  title: string;
  description: string;
  to?: string;
}

const SURFACES: Array<SurfaceCard> = [
  {
    title: "Corpora",
    description:
      "Scan findings and basename match quality — the canonical corpus diagnostics view (replaces server-log warnings).",
    to: "/lab/corpora",
  },
  {
    title: "Audiobooks",
    description:
      "Every m4b with ffprobe metadata (duration, size, codec, bitrate).",
    to: "/lab/audiobooks",
  },
  {
    title: "Epub",
    description:
      "Books with an ebook; validation later (epub-validate is the inspiration).",
    to: "/lab/epub",
  },
  {
    title: "VTT",
    description: "Transcripts with cue counts and span durations.",
    to: "/lab/vtt",
  },
  {
    title: "Alignment",
    description:
      "Epub/vtt pairs with coverage metrics from cached artifacts, plus artifact-cache visibility.",
    to: "/lab/alignment",
  },
  {
    title: "Locate",
    description:
      "Does every matched token produce a working epubcfi in the real epub.js? DOM-path resolve -> text guard -> CFI -> round-trip.",
    to: "/lab/locate",
  },
  {
    title: "Parsers",
    description: "Reserved: parser equivalence/swappability.",
  },
];

function LabIndexPage() {
  return (
    <div className="p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SURFACES.map((surface) => (
          <SurfaceTile key={surface.title} surface={surface} />
        ))}
      </div>
    </div>
  );
}

function SurfaceTile({ surface }: { surface: SurfaceCard }) {
  const body = (
    <>
      <h2 className="text-sm font-medium text-slate-200">{surface.title}</h2>
      <p className="mt-1 text-xs text-slate-500">{surface.description}</p>
    </>
  );

  if (!surface.to) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 opacity-50">
        {body}
      </div>
    );
  }

  return (
    <Link
      to={surface.to}
      className="block rounded-lg border border-slate-700 bg-slate-800/60 p-3 transition-colors hover:border-slate-500"
    >
      {body}
    </Link>
  );
}
