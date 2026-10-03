/**
 * Follow panel: the follow player's bottom bar, in place of the audio
 * control panel. One compact line: connection, audio position, tick age,
 * running or frozen.
 */
import { Link } from "@tanstack/react-router";

import { formatDuration } from "#/lib/browse";
import type { ClockReading } from "#/lib/remote-clock";
import type { FollowState } from "#/lib/follow-session";

const CONNECTION_LABELS: Record<FollowState["status"], string> = {
  idle: "starting",
  "no-key": "no key",
  connecting: "connecting",
  authenticated: "connected",
  rejected: "key rejected",
  reconnecting: "reconnecting",
};

/** `session` is null when follow mode is not configured; `reading` is the
 *  remote clock for this book, null until its first tick. */
export function FollowPanel({
  session,
  reading,
}: {
  session: FollowState | null;
  reading: ClockReading | null;
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
          ) : reading ? (
            <ClockReadout reading={reading} />
          ) : (
            <span className="text-slate-400">waiting for playback</span>
          )}
        </>
      )}
    </div>
  );
}

function ClockReadout({ reading }: { reading: ClockReading }) {
  return (
    <>
      <span data-testid="follow-audio-position">
        {formatDuration(reading.audioPosition)}
      </span>
      <span className="text-slate-400" data-testid="follow-tick-age">
        {Math.round(reading.tickAgeMs / 1000)} s ago
      </span>
      <span
        className={reading.frozen ? "text-amber-300" : "text-slate-400"}
        data-testid="follow-clock-state"
      >
        {reading.frozen ? "frozen" : "running"}
      </span>
    </>
  );
}
