/**
 * Follow panel: the follow player's bottom bar, in place of the audio
 * control panel. One compact line at every width, glyphs over words (the
 * long form is in each tooltip):
 *
 *   ✓▶  1:30:58  11s  1.70×   − +1.0 +   ⏏
 *
 * connection and clock state, audio position, tick age, rate, the offset
 * control, and eject (Stop following: back to the local player).
 */
import { Link } from "@tanstack/react-router";
import {
  Check,
  CircleAlert,
  Ellipsis,
  LoaderCircle,
  Minus,
  Play,
  Plus,
  Snowflake,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatCompactDuration } from "#/lib/browse";
import { nudgeFollowOffset } from "#/lib/follow-session";
import type { FollowState } from "#/lib/follow-session";
import type { ClockReading } from "#/lib/remote-clock";

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
  const notice = session && !reading ? itemNotice(session) : null;
  return (
    <div
      className="flex shrink-0 items-center gap-2 whitespace-nowrap border-t border-slate-700 bg-slate-800 px-2 py-2 text-xs tabular-nums text-slate-400 sm:gap-3 sm:px-3"
      data-testid="follow-panel"
    >
      {session === null ? (
        <>
          <Glyph icon={X} className="text-rose-400" label="Not configured" />
          <span className="min-w-0 truncate">
            Follow mode is not configured.
          </span>
        </>
      ) : (
        <>
          <span className="flex shrink-0 items-center">
            <ConnectionGlyph session={session} />
            <ClockGlyph reading={reading} notice={notice} />
          </span>
          {reading ? (
            <>
              <span className="text-white" data-testid="follow-audio-position">
                {formatCompactDuration(reading.audioPosition)}
              </span>
              <span title="Since the last tick" data-testid="follow-tick-age">
                {Math.round(reading.tickAgeMs / 1000)}s
              </span>
              <span title="Rate" data-testid="follow-rate">
                {session.clock.rate.toFixed(2)}×
              </span>
            </>
          ) : (
            <span
              className={`min-w-0 truncate ${notice ? "text-amber-300" : ""}`}
              title={notice ?? undefined}
              data-testid="follow-notice"
            >
              {notice ?? "waiting"}
            </span>
          )}
        </>
      )}
      <div className="ml-auto flex shrink-0 items-center">
        {session && <OffsetControl offsetSec={session.offsetSec} />}
        <Link
          to="/player/$bookId"
          params={{ bookId }}
          className="-my-2 ml-1 flex h-9 w-9 touch-manipulation items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
          aria-label="Stop following: play here"
          title="Stop following: play here"
        >
          <EjectIcon />
        </Link>
      </div>
    </div>
  );
}

/** Why there is no reading: audiobookshelf moved to an item that isn't this
 *  book and won't open one. null while waiting or switching books. */
function itemNotice(session: FollowState): string | null {
  const result = session.resolution?.result;
  if (!result || "bookId" in result) return null;
  return "unmatched" in result
    ? `${result.title} isn't in this library`
    : "audiobookshelf is playing an item the server can't identify yet";
}

function ConnectionGlyph({ session }: { session: FollowState }) {
  switch (session.status) {
    case "authenticated":
      return (
        <Glyph icon={Check} className="text-emerald-400" label="Connected" />
      );
    case "no-key":
    case "rejected": {
      // The key form lives on the follow entry page.
      const label =
        session.status === "rejected"
          ? "Key rejected: set a new key"
          : "No key: set one";
      return (
        <Link
          to="/player/follow"
          className="-my-2 flex h-9 items-center"
          aria-label={label}
          title={label}
        >
          <X className="h-4 w-4 text-rose-400" />
        </Link>
      );
    }
    case "idle":
    case "connecting":
    case "reconnecting":
      return (
        <Glyph
          icon={LoaderCircle}
          className="animate-spin text-amber-300"
          label={
            session.status === "reconnecting" ? "Reconnecting" : "Connecting"
          }
        />
      );
  }
}

function ClockGlyph({
  reading,
  notice,
}: {
  reading: ClockReading | null;
  notice: string | null;
}) {
  if (reading?.frozen) {
    return (
      <Glyph
        icon={Snowflake}
        className="text-sky-300"
        label="Frozen: no tick for 15 s"
      />
    );
  }
  if (reading) {
    return (
      <Glyph
        icon={Play}
        className="fill-current text-emerald-400"
        label="Running"
      />
    );
  }
  if (notice) {
    return (
      <Glyph
        icon={CircleAlert}
        className="text-amber-300"
        label="Not in this library"
      />
    );
  }
  return (
    <Glyph
      icon={Ellipsis}
      className="text-slate-500"
      label="Waiting for playback"
    />
  );
}

function Glyph({
  icon: Icon,
  className,
  label,
}: {
  icon: LucideIcon;
  className: string;
  label: string;
}) {
  return (
    <span role="img" aria-label={label} title={label}>
      <Icon className={`h-4 w-4 ${className}`} aria-hidden />
    </span>
  );
}

function OffsetControl({ offsetSec }: { offsetSec: number }) {
  const value = `${offsetSec > 0 ? "+" : ""}${offsetSec.toFixed(1)}`;
  return (
    <span className="flex items-center" title={`Offset ${value} s`}>
      <OffsetButton direction={-1} />
      <span
        className="w-8 text-center text-slate-300"
        data-testid="follow-offset"
      >
        {value}
      </span>
      <OffsetButton direction={1} />
    </span>
  );
}

// 36 px touch target reaching into the bar's padding (-my-2), so the bar
// stays one text line tall; touch-manipulation stops a quick double tap
// from zooming on iOS.
function OffsetButton({ direction }: { direction: 1 | -1 }) {
  const label =
    direction > 0 ? "Increase offset by 0.1 s" : "Decrease offset by 0.1 s";
  const Icon = direction > 0 ? Plus : Minus;
  return (
    <button
      type="button"
      onClick={() => nudgeFollowOffset(direction)}
      className="-my-2 flex h-9 w-9 touch-manipulation items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** Eject (lucide has none): a triangle over a bar, in lucide's stroke style. */
function EjectIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5 19 14H5Z" />
      <path d="M5 19h14" />
    </svg>
  );
}
