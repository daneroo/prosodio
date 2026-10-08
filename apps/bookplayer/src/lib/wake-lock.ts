/**
 * Screen wake lock: keeps the screen awake while a player screen is visible.
 * Desired = started and the page visible; actual = a held sentinel. Every
 * trigger (start, stop, visibility change, a request settling, the browser
 * releasing the lock on hide, a user tap) just reconciles the two, so it is
 * idempotent. Needs a secure context
 * (https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API);
 * without the API, or when a request is refused, everything is a silent no-op.
 *
 * iPadOS grants the lock only with user activation: the request on mount
 * rides the tap that opened the player, but the one on returning to the page
 * is refused (seen on the device, 2026-10-05; WebKit bug 254545 reports the
 * NotAllowedError). So every tap reconciles too, re-acquiring a lost lock.
 */
import { useEffect } from "react";

/** The part of `WakeLockSentinel` used here. */
interface Sentinel {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
}

/** The part of `navigator.wakeLock` used here. */
export interface WakeLockApi {
  request: (type: "screen") => Promise<Sentinel>;
}

export interface VisibilitySource {
  isVisible: () => boolean;
  /** Subscribes to visibility changes; returns the unsubscribe. */
  onChange: (listener: () => void) => () => void;
}

export interface WakeLockDeps {
  /** `navigator.wakeLock`; undefined where the API is unavailable. */
  wakeLock: WakeLockApi | undefined;
  visibility: VisibilitySource;
  /** Subscribes to user activation (a tap or key); returns the unsubscribe. */
  onActivation: (listener: () => void) => () => void;
}

export interface WakeLock {
  start: () => void;
  stop: () => void;
}

export function createWakeLock({
  wakeLock,
  visibility,
  onActivation,
}: WakeLockDeps): WakeLock {
  let started = false;
  let held: Sentinel | null = null;
  let requesting = false;
  let unsubscribe: Array<() => void> = [];

  const desired = () => started && visibility.isVisible();

  function reconcile(): void {
    if (!wakeLock) return;
    if (desired()) {
      if (!held && !requesting) request(wakeLock);
    } else if (held) {
      const sentinel = held;
      held = null;
      release(sentinel);
    }
  }

  function request(api: WakeLockApi): void {
    requesting = true;
    api.request("screen").then(
      (sentinel) => {
        requesting = false;
        if (!desired()) {
          // Stopped or hidden while the request was pending.
          release(sentinel);
          return;
        }
        held = sentinel;
        // The browser releases the lock when the page is hidden.
        sentinel.addEventListener("release", () => {
          if (held === sentinel) held = null;
        });
      },
      () => {
        requesting = false;
      },
    );
  }

  return {
    start() {
      if (started) return;
      started = true;
      unsubscribe = [visibility.onChange(reconcile), onActivation(reconcile)];
      reconcile();
    },
    stop() {
      if (!started) return;
      started = false;
      for (const off of unsubscribe) off();
      unsubscribe = [];
      reconcile();
    },
  };
}

function release(sentinel: Sentinel): void {
  sentinel.release().catch(() => {});
}

/** Holds the wake lock while the calling component is mounted. */
export function useWakeLock(deps?: WakeLockDeps): void {
  useEffect(() => {
    // Resolved in the effect, never during render: SSR has no navigator.
    const lock = createWakeLock(deps ?? browserDeps());
    lock.start();
    return () => lock.stop();
  }, [deps]);
}

function browserDeps(): WakeLockDeps {
  return {
    wakeLock: "wakeLock" in navigator ? navigator.wakeLock : undefined,
    visibility: {
      isVisible: () => document.visibilityState === "visible",
      onChange(listener) {
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
    },
    // A touch activates on pointerup, not pointerdown (HTML "activation
    // triggering input event"); capture so no handler can swallow it.
    onActivation(listener) {
      const options = { capture: true, passive: true };
      document.addEventListener("pointerup", listener, options);
      document.addEventListener("keydown", listener, options);
      return () => {
        document.removeEventListener("pointerup", listener, options);
        document.removeEventListener("keydown", listener, options);
      };
    },
  };
}
