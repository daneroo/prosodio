/**
 * Follow session: the one audiobookshelf connection behind follow mode.
 * A module-level store read through useSyncExternalStore, so it survives
 * client-side navigation (the entry route now; book switches later). Views
 * hold it while mounted; the socket closes a few seconds after the last one
 * unmounts, so a navigation between follow views keeps the connection.
 *
 * The API key is per device (localStorage), read only after mount so server
 * rendering and hydration agree.
 *
 * Each newly reported item is resolved to a library book by the server's
 * identity map; `followed` is the last tick of an item that resolved to a
 * book, which is what the follow player shows.
 */
import { useEffect, useSyncExternalStore } from "react";
import { io } from "socket.io-client";

import { connect } from "#/lib/audiobookshelf-socket";
import { resolveFollowBook } from "#/server/follow";
import type { FollowResolution } from "#/lib/identity-map";
import type {
  AudiobookshelfSocket,
  SocketEvent,
  SocketStatus,
  Tick,
} from "#/lib/audiobookshelf-socket";

/** "idle": not started yet (server render, first client render) or closed. */
export type FollowStatus = "idle" | "no-key" | SocketStatus;

export interface FollowState {
  status: FollowStatus;
  hasKey: boolean;
  lastTick: Tick | null;
  /** The identity map's answer for `lastTick`'s item; null while pending. */
  resolution: { itemId: string; result: FollowResolution } | null;
  /** The last tick whose item resolved to a library book. */
  followed: { bookId: string; tick: Tick } | null;
}

/** Holds the session while mounted; `url` is the configured audiobookshelf URL. */
export function useFollowSession(url: string): FollowState {
  const snapshot = useSyncExternalStore(subscribe, getState, getServerState);
  useEffect(() => acquire(url), [url]);
  return snapshot;
}

export function saveApiKey(key: string): void {
  const apiKey = key.trim();
  if (!apiKey) return;
  try {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  } catch {
    /* persistence is best-effort; the session still connects below */
  }
  closeSocket();
  set(NO_TICKS);
  ensureConnected(apiKey);
}

export function forgetApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    /* persistence is best-effort */
  }
  closeSocket();
  set({ status: "no-key", hasKey: false, ...NO_TICKS });
}

const API_KEY_STORAGE_KEY = "bookplayer:follow-api-key";
const CLOSE_DELAY_MS = 5000;

const NO_TICKS = { lastTick: null, resolution: null, followed: null };
const INITIAL: FollowState = { status: "idle", hasKey: false, ...NO_TICKS };

let state = INITIAL;
const listeners = new Set<() => void>();
let url: string | null = null;
let socket: AudiobookshelfSocket | null = null;
let holders = 0;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
/** The item a resolveFollowBook call is in flight for. */
let resolvingItemId: string | null = null;

function acquire(nextUrl: string): () => void {
  holders += 1;
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  if (url !== nextUrl) {
    url = nextUrl;
    closeSocket();
  }
  if (!socket) ensureConnected(readApiKey());
  return release;
}

function release(): void {
  holders -= 1;
  if (holders > 0) return;
  closeTimer = setTimeout(() => {
    closeTimer = null;
    closeSocket();
    set({ status: "idle", ...NO_TICKS });
  }, CLOSE_DELAY_MS);
}

function ensureConnected(apiKey: string | null): void {
  if (!url) return;
  if (!apiKey) {
    set({ status: "no-key", hasKey: false });
    return;
  }
  set({ hasKey: true });
  socket = connect({ url, apiKey, io });
  socket.subscribe(onSocketEvent);
}

function onSocketEvent(event: SocketEvent): void {
  if (event.type === "status") set({ status: event.status });
  else onTick(event.tick);
}

function onTick(tick: Tick): void {
  const known = state.resolution;
  if (known?.itemId === tick.itemId && !("unknown" in known.result)) {
    set({ lastTick: tick, ...followedPatch(known.result, tick) });
    return;
  }
  // A new item, or one the server didn't know yet (its map rebuilds on a
  // miss, at most once a minute): ask again.
  set({
    lastTick: tick,
    resolution: known?.itemId === tick.itemId ? known : null,
  });
  if (resolvingItemId === tick.itemId) return;
  resolvingItemId = tick.itemId;
  resolveFollowBook({ data: tick.itemId })
    .then((result) => {
      if (resolvingItemId !== tick.itemId) return;
      resolvingItemId = null;
      const latest = state.lastTick;
      if (latest?.itemId !== tick.itemId) return;
      set({
        resolution: { itemId: tick.itemId, result },
        ...followedPatch(result, latest),
      });
    })
    .catch((error: unknown) => {
      // Asked again on the next tick.
      if (resolvingItemId === tick.itemId) resolvingItemId = null;
      console.warn("[follow] resolve failed", error);
    });
}

function followedPatch(
  result: FollowResolution,
  tick: Tick,
): Partial<FollowState> {
  return "bookId" in result
    ? { followed: { bookId: result.bookId, tick } }
    : {};
}

function closeSocket(): void {
  socket?.close();
  socket = null;
  resolvingItemId = null;
}

function readApiKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function set(patch: Partial<FollowState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getState(): FollowState {
  return state;
}

function getServerState(): FollowState {
  return INITIAL;
}
