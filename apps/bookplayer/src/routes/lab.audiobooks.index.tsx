/**
 * /lab/audiobooks — audiobook metadata surface (plan
 * thoughts/plans/lab-routes-refined.md, S1). Every m4b with ffprobe metadata
 * (duration, size, codec, bitrate) inspection.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/lab/audiobooks/")({
  component: AudiobooksRoute,
});

function AudiobooksRoute() {
  if (!import.meta.env.DEV) {
    return (
      <p className="p-4 text-sm text-slate-400">Audiobooks is dev-only.</p>
    );
  }
  return <AudiobooksPage />;
}

function AudiobooksPage() {
  return (
    <div className="p-4">
      <p className="text-xs text-slate-500">
        Audiobooks — every m4b with ffprobe metadata (duration, size, codec,
        bitrate) (plan S3).
      </p>
    </div>
  );
}
