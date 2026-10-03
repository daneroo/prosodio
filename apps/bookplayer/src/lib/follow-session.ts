/**
 * Follow session: the one audiobookshelf connection behind follow mode.
 * A module-level store read through useSyncExternalStore, so it survives
 * client-side navigation (the entry route now; book switches later). Views
 * hold it while mounted; the socket closes a few seconds after the last one
 * unmounts, so a navigation between follow views keeps the connection.
 *
 * The API key is per device (localStorage), read only after mount so server
 * rendering and hydration agree.
 */
import { useEffect, useSyncExternalStore } from "react";
import { io } from "socket.io-client";

import { connect } from "#/lib/audiobookshelf-socket";
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
  set({ lastTick: null });
  ensureConnected(apiKey);
}

export function forgetApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    /* persistence is best-effort */
  }
  closeSocket();
  set({ status: "no-key", hasKey: false, lastTick: null });
}

const API_KEY_STORAGE_KEY = "bookplayer:follow-api-key";
const CLOSE_DELAY_MS = 5000;

const INITIAL: FollowState = { status: "idle", hasKey: false, lastTick: null };

let state = INITIAL;
const listeners = new Set<() => void>();
let url: string | null = null;
let socket: AudiobookshelfSocket | null = null;
let holders = 0;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

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
    set({ status: "idle", lastTick: null });
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
  else set({ lastTick: event.tick });
}

function closeSocket(): void {
  socket?.close();
  socket = null;
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
