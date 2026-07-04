/**
 * Bottom dock: transcript strip above the transport. Desktop transport is
 * one row; below `sm` it becomes two rows (seek above buttons) so every
 * control — ±1m/±15s, speed, volume — stays visible at 390 px (both
 * experiments hid or clipped controls on mobile; this design does not).
 */
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";

import { Transcript } from "#/components/Transcript";
import { formatDuration } from "#/lib/browse";

export const SPEED_STEPS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

interface PlayerDockProps {
  bookId: string;
  title: string;
  author: string | null;
  hasEpub: boolean;
  hasVtt: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  volume: number;
  audioError: string | null;
  onTogglePlay: () => void;
  onSeek: (sec: number) => void;
  onSkip: (sec: number) => void;
  onCycleSpeed: () => void;
  onVolume: (v: number) => void;
}

export function PlayerDock(props: PlayerDockProps) {
  const {
    bookId,
    playing,
    currentTime,
    duration,
    speed,
    volume,
    audioError,
    onTogglePlay,
    onSeek,
    onSkip,
    onCycleSpeed,
    onVolume,
  } = props;

  return (
    <div className="shrink-0" data-testid="player-dock">
      <Transcript bookId={bookId} currentTime={currentTime} onSeek={onSeek} />

      <div className="border-t border-slate-700 bg-slate-800 px-3 py-2">
        {audioError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-red-400">
              Audio unavailable: {audioError}
            </p>
            <BookIdentity {...props} />
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            {/* Identity (compact cover thumbnail only — never dominant). */}
            <div className="hidden sm:block">
              <BookIdentity {...props} />
            </div>

            {/* Seek row (full-width on mobile). */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500">
                {formatDuration(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={1}
                value={Math.min(currentTime, duration || 0)}
                onChange={(e) => onSeek(Number.parseFloat(e.target.value))}
                className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-500"
                aria-label="Seek"
              />
              <span className="w-16 shrink-0 text-xs tabular-nums text-slate-500">
                {formatDuration(duration)}
              </span>
            </div>

            {/* Transport buttons + speed + volume. */}
            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
              <TransportButton label="-1m" onClick={() => onSkip(-60)}>
                <RotateCcw className="h-3.5 w-3.5" />
              </TransportButton>
              <TransportButton label="-15s" onClick={() => onSkip(-15)}>
                <RotateCcw className="h-3.5 w-3.5" />
              </TransportButton>
              <button
                type="button"
                onClick={onTogglePlay}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-600 text-white transition-colors hover:bg-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-300"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="ml-0.5 h-4 w-4" />
                )}
              </button>
              <TransportButton label="+15s" onClick={() => onSkip(15)}>
                <RotateCw className="h-3.5 w-3.5" />
              </TransportButton>
              <TransportButton label="+1m" onClick={() => onSkip(60)}>
                <RotateCw className="h-3.5 w-3.5" />
              </TransportButton>
              <button
                type="button"
                onClick={onCycleSpeed}
                className="ml-1 rounded border border-slate-600 px-2 py-1 text-xs tabular-nums text-slate-300 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500"
                aria-label="Playback speed"
              >
                {speed}×
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => onVolume(Number.parseFloat(e.target.value))}
                className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-500 sm:w-20"
                aria-label="Volume"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BookIdentity({
  bookId,
  title,
  author,
  hasEpub,
  hasVtt,
}: Pick<
  PlayerDockProps,
  "bookId" | "title" | "author" | "hasEpub" | "hasVtt"
>) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img
        src={`/api/cover/${bookId}`}
        alt=""
        className="h-11 w-11 shrink-0 rounded object-cover"
      />
      <div className="min-w-0">
        <p className="max-w-44 truncate text-xs font-semibold">{title}</p>
        {author && (
          <p className="max-w-44 truncate text-[11px] text-slate-400">
            {author}
          </p>
        )}
        <div className="mt-0.5 flex gap-1">
          <span className="rounded bg-slate-700 px-1 py-px text-[9px] text-slate-400">
            M4B
          </span>
          {hasEpub && (
            <span className="rounded bg-cyan-900/60 px-1 py-px text-[9px] text-cyan-400">
              EPUB
            </span>
          )}
          {hasVtt && (
            <span className="rounded bg-emerald-900/60 px-1 py-px text-[9px] text-emerald-400">
              VTT
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TransportButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-0 px-1 py-0.5 text-slate-400 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500"
      aria-label={`Skip ${label}`}
    >
      {children}
      <span className="text-[9px] tabular-nums">{label}</span>
    </button>
  );
}
