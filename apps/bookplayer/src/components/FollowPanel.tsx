/**
 * Follow panel: the follow player's bottom bar, in place of the audio
 * control panel. One compact line: connection, audio position, tick age.
 */
import { Link } from "@tanstack/react-router";

import { formatDuration } from "#/lib/browse";
import { useNow } from "#/lib/use-now";
import type { Tick } from "#/lib/audiobookshelf-socket";
import type { FollowState } from "#/lib/follow-session";

const CONNECTION_LABELS: Record<FollowState["status"], string> = {
  idle: "starting",
  "no-key": "no key",
  connecting: "connecting",
  authenticated: "connected",
  rejected: "key rejected",
  reconnecting: "reconnecting",
};

/** `session` is null when follow mode is not configured; `tick` is the last
 *  tick for this book. */
export function FollowPanel({
  session,
  tick,
}: {
  session: FollowState | null;
  tick: Tick | null;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-3 border-t border-slate-700 bg-slate-800 px-3 py-2 text-xs tabular-nums text-slate-300"
      data-testid="follow-panel"
    >
      {session === null ? (
        <span>Follow mode is not configured.</span>
      ) : (
        <>
          <span data-testid="follow-connection">
            {CONNECTION_LABELS[session.status]}
          </span>
          {session.status === "no-key" || session.status === "rejected" ? (
            <Link
              to="/player/follow"
              className="text-cyan-400 underline transition-colors hover:text-cyan-300"
            >
              Set key
            </Link>
          ) : tick ? (
            <TickReadout tick={tick} />
          ) : (
            <span className="text-slate-400">waiting for playback</span>
          )}
        </>
      )}
    </div>
  );
}

function TickReadout({ tick }: { tick: Tick }) {
  const now = useNow(1000);
  const ageSec = Math.max(0, Math.round((now - tick.receivedAt) / 1000));
  return (
    <>
      <span data-testid="follow-audio-position">
        {formatDuration(tick.audioPosition)}
      </span>
      <span className="text-slate-400" data-testid="follow-tick-age">
        {ageSec} s ago
      </span>
    </>
  );
}
