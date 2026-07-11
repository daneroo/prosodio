import { useCallback, useEffect, useRef, useState } from "react";

import { SPEED_STEPS } from "#/components/PlayerDock";

/**
 * Audio element lifecycle + transport commands + keyboard transport + position
 * persistence. Manages the hidden <audio> element: play/pause, seek, speed,
 * volume, resume from saved position, and keyboard shortcuts (Space, arrows).
 * Consumed by PlayerPage route (player/$bookId.tsx).
 */
export function useAudioTransport(bookId: string) {
  const ref = useRef<HTMLAudioElement>(null);
  const lastSaveRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolumeState] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;

    const savePos = (time: number) => {
      try {
        localStorage.setItem(audioPosKey(bookId), String(time));
      } catch {
        /* persistence is best-effort */
      }
    };
    const safeDuration = () =>
      Number.isFinite(audio.duration) ? audio.duration : 0;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      const now = Date.now();
      if (now - lastSaveRef.current > 2000) {
        savePos(audio.currentTime);
        lastSaveRef.current = now;
      }
    };
    const onLoadedMetadata = () => {
      setDuration(safeDuration());
      try {
        const saved = Number.parseFloat(
          localStorage.getItem(audioPosKey(bookId)) ?? "",
        );
        if (Number.isFinite(saved) && saved > 0 && saved < audio.duration) {
          audio.currentTime = saved;
        }
      } catch {
        /* resume is best-effort */
      }
    };
    const onDurationChange = () => setDuration(safeDuration());
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      savePos(audio.currentTime);
    };
    const onError = () =>
      setError("file missing or unsupported — the reader still works");

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    audio.addEventListener("error", onError);
    return () => {
      if (audio.currentTime > 0) savePos(audio.currentTime);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
      audio.removeEventListener("error", onError);
    };
  }, [bookId]);

  const togglePlay = useCallback(() => {
    const audio = ref.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const seek = useCallback((sec: number) => {
    const audio = ref.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, sec);
    setCurrentTime(audio.currentTime);
  }, []);

  const skip = useCallback((delta: number) => {
    const audio = ref.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.min(Math.max(0, audio.currentTime + delta), max);
    setCurrentTime(audio.currentTime);
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const index = SPEED_STEPS.indexOf(
        current as (typeof SPEED_STEPS)[number],
      );
      const next = SPEED_STEPS[(index + 1) % SPEED_STEPS.length] ?? 1;
      if (ref.current) ref.current.playbackRate = next;
      return next;
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (ref.current) ref.current.volume = v;
  }, []);

  // Keyboard transport: Space play/pause, arrows ±15 s, Shift+arrows ±1 m.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      switch (event.key) {
        case " ":
          event.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          event.preventDefault();
          skip(event.shiftKey ? -60 : -15);
          break;
        case "ArrowRight":
          event.preventDefault();
          skip(event.shiftKey ? 60 : 15);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, skip]);

  return {
    ref,
    playing,
    currentTime,
    duration,
    speed,
    volume,
    error,
    togglePlay,
    seek,
    skip,
    cycleSpeed,
    setVolume,
  };
}

/** localStorage key for storing/resuming audio position by book. */
function audioPosKey(bookId: string): string {
  return `bookplayer:${bookId}:audio`;
}
