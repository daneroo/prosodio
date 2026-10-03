/**
 * Follow panel: the follow player's bottom bar, in place of the audio
 * control panel. One compact line on a phone: connection, audio position,
 * tick age, running or frozen, offset −/+ and Stop following. From `sm`
 * up it adds the rate, the offset value and Forget key.
 */
import { Link } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";

import { formatDuration } from "#/lib/browse";
import { forgetApiKey, nudgeFollowOffset } from "#/lib/follow-session";
import type { FollowState } from "#/lib/follow-session";
import type { ClockReading } from "#/lib/remote-clock";

const CONNECTION_LABELS: Record<FollowState["status"], string> = {
  idle: "starting",
  "no-key": "no key",
  connecting: "connecting",
  authenticated: "connected",
  rejected: "key rejected",
  reconnecting: "reconnecting",
};

/** `session` is null when follow mode is not configured; `reading` is the
 *  displayed audio position for this book, null until its first tick. */
export function FollowPanel({
  bookId,
  session,
  reading = null,
}: {
  bookId: string;
  session: FollowState | null;
  reading?: ClockReading | null;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap border-t border-slate-700 bg-slate-800 px-2 py-2 text-xs tabular-nums text-slate-300 sm:gap-3 sm:px-3"
      data-testid="follow-panel"
    >
      {session === null ? (
        <span className="min-w-0 truncate">Follow mode is not configured.</span>
      ) : (
        <>
          <span className="shrink-0" data-testid="follow-connection">
            {CONNECTION_LABELS[session.status]}
          </span>
          <FollowStatus session={session} reading={reading} />
        </>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {session && <OffsetControl session={session} />}
        <Link
          to="/player/$bookId"
          params={{ bookId }}
          className="rounded border border-slate-600 px-2 py-0.5 text-slate-200 transition-colors hover:text-white"
        >
          Stop following
        </Link>
        {session?.hasKey && (
          <button
            type="button"
            onClick={forgetApiKey}
            className="hidden text-slate-400 underline transition-colors hover:text-slate-300 sm:inline"
          >
            Forget key
          </button>
        )}
      </div>
    </div>
  );
}

function FollowStatus({
  session,
  reading,
}: {
  session: FollowState;
  reading: ClockReading | null;
}) {
  if (session.status === "no-key" || session.status === "rejected") {
    return (
      <Link
        to="/player/follow"
        className="text-cyan-400 underline transition-colors hover:text-cyan-300"
      >
        Set key
      </Link>
    );
  }
  // audiobookshelf moved to an item that isn't this book and won't open one.
  const result = session.resolution?.result;
  if (!reading && result && !("bookId" in result)) {
    const message =
      "unmatched" in result
        ? `audiobookshelf is playing ${result.title}, which isn't in this library`
        : "audiobookshelf is playing an item the Bookplayer server can't identify yet";
    return (
      <span
        className="min-w-0 truncate text-amber-300"
        title={message}
        data-testid="follow-notice"
      >
        {message}
      </span>
    );
  }
  if (!reading) {
    return <span className="text-slate-400">waiting for playback</span>;
  }
  return (
    <>
      <span data-testid="follow-audio-position">
        {formatDuration(reading.audioPosition)}
      </span>
      <span className="text-slate-400" data-testid="follow-tick-age">
        {Math.round(reading.tickAgeMs / 1000)} s
        <span className="hidden sm:inline"> ago</span>
      </span>
      <span
        className={reading.frozen ? "text-amber-300" : "text-slate-400"}
        data-testid="follow-clock-state"
      >
        {reading.frozen ? "frozen" : "running"}
      </span>
      <span
        className="hidden text-slate-400 sm:inline"
        data-testid="follow-rate"
      >
        {session.clock.rate.toFixed(2)}×
      </span>
    </>
  );
}

function OffsetControl({ session }: { session: FollowState }) {
  const offset = session.offsetSec;
  const value = `${offset > 0 ? "+" : ""}${offset.toFixed(1)} s`;
  return (
    <span className="flex items-center gap-1" title={`Offset ${value}`}>
      <OffsetButton direction={-1} />
      <span
        className="hidden w-12 text-center sm:inline"
        data-testid="follow-offset"
      >
        {value}
      </span>
      <OffsetButton direction={1} />
    </span>
  );
}

function OffsetButton({ direction }: { direction: 1 | -1 }) {
  const label =
    direction > 0 ? "Increase offset by 0.1 s" : "Decrease offset by 0.1 s";
  const Icon = direction > 0 ? Plus : Minus;
  return (
    <button
      type="button"
      onClick={() => nudgeFollowOffset(direction)}
      className="rounded border border-slate-600 p-1 text-slate-300 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500"
      aria-label={label}
      title={label}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}
