/**
 * Browser-side client for audiobookshelf's Socket.IO (ADR-0001, follow mode).
 * Authenticates with the API key, reports connection status, and turns
 * `user_item_progress_updated` events into ticks. The socket factory is
 * injected so tests drive it with a fake.
 */
import { z } from "zod";

export type SocketStatus =
  "connecting" | "authenticated" | "rejected" | "reconnecting";

/** One progress report from audiobookshelf, stamped when received. */
export interface Tick {
  itemId: string;
  /** Seconds. */
  audioPosition: number;
  duration: number | null;
  /** Epoch ms from the injected clock. */
  receivedAt: number;
}

export type SocketEvent =
  { type: "status"; status: SocketStatus } | { type: "tick"; tick: Tick };

/** The subset of a socket.io-client Socket this module uses. */
export interface SocketLike {
  on: (event: string, listener: (...args: any[]) => void) => unknown;
  emit: (event: string, ...args: unknown[]) => unknown;
  disconnect: () => unknown;
}
export type IoFactory = (uri: string, opts: { path: string }) => SocketLike;

export interface AudiobookshelfSocket {
  /** Listener gets the current status immediately (replay), then every
   *  later event. Returns unsubscribe. */
  subscribe: (listener: (event: SocketEvent) => void) => () => void;
  /** Disconnects; no further events are delivered. Idempotent. */
  close: () => void;
}

export function connect(options: {
  url: string;
  apiKey: string;
  io: IoFactory;
  now?: () => number;
}): AudiobookshelfSocket {
  const { url, apiKey, io, now = Date.now } = options;
  const listeners = new Set<(event: SocketEvent) => void>();
  let status: SocketStatus = "connecting";
  let closed = false;

  const emit = (event: SocketEvent): void => {
    if (closed) return;
    for (const listener of listeners) listener(event);
  };
  const setStatus = (next: SocketStatus): void => {
    if (next === status) return;
    status = next;
    emit({ type: "status", status });
  };

  // Origin only: audiobookshelf serves Socket.IO at /socket.io on the origin
  // even when the configured URL carries a sub-path.
  const socket = io(new URL(url).origin, { path: "/socket.io" });

  // Every (re)connect re-authenticates; Socket.IO owns the reconnection.
  socket.on("connect", () => {
    if (status !== "rejected") socket.emit("auth", apiKey);
  });
  socket.on("init", () => {
    if (status !== "rejected") setStatus("authenticated");
  });
  socket.on("disconnect", () => {
    if (status !== "rejected") setStatus("reconnecting");
  });

  // A rejected key is final: stop instead of retrying a doomed auth.
  const reject = (): void => {
    if (status === "rejected") return;
    setStatus("rejected");
    socket.disconnect();
  };
  socket.on("invalid_token", reject);
  socket.on("auth_failed", reject);

  socket.on("user_item_progress_updated", (payload: unknown) => {
    const tick = parseTick(payload, now());
    if (tick) emit({ type: "tick", tick });
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener({ type: "status", status });
      return () => listeners.delete(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      socket.disconnect();
    },
  };
}

const progressReportSchema = z.object({
  data: z.object({
    libraryItemId: z.string(),
    currentTime: z.number(),
    duration: z.number().nullish(),
  }),
});

/** Malformed payloads are not ours to report: null, so the caller ignores them. */
function parseTick(payload: unknown, receivedAt: number): Tick | null {
  const parsed = progressReportSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { libraryItemId, currentTime, duration } = parsed.data.data;
  return {
    itemId: libraryItemId,
    audioPosition: currentTime,
    duration: duration ?? null,
    receivedAt,
  };
}
