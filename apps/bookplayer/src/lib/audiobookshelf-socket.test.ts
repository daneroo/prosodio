import { describe, expect, test } from "bun:test";
import { io } from "socket.io-client";
import { connect } from "./audiobookshelf-socket.ts";
import type {
  IoFactory,
  SocketEvent,
  SocketLike,
  SocketStatus,
} from "./audiobookshelf-socket.ts";

/** Type-level check: socket.io-client's real `io` satisfies IoFactory. */
export const realIo: IoFactory = io;

const API_KEY = "test-key";

/** In-test socket: records what the module emits and lets tests fire events. */
class FakeSocket implements SocketLike {
  handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  emitted: { event: string; args: unknown[] }[] = [];
  disconnectCalls = 0;

  on(event: string, listener: (...args: never[]) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(listener as (...args: unknown[]) => void);
    this.handlers.set(event, list);
    return this;
  }
  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    return this;
  }
  disconnect(): this {
    this.disconnectCalls++;
    return this;
  }
  /** Simulate the server / Socket.IO delivering an event. */
  fire(event: string, ...args: unknown[]): void {
    for (const h of this.handlers.get(event) ?? []) h(...args);
  }
  authEmits(): unknown[][] {
    return this.emitted.filter((e) => e.event === "auth").map((e) => e.args);
  }
}

function setup(url = "https://host/", now = () => 1000) {
  const socket = new FakeSocket();
  const ioCalls: { uri: string; opts: { path: string } }[] = [];
  const factory: IoFactory = (uri, opts) => {
    ioCalls.push({ uri, opts });
    return socket;
  };
  const client = connect({ url, apiKey: API_KEY, io: factory, now });
  const events: SocketEvent[] = [];
  client.subscribe((e) => events.push(e));
  const statuses = (): SocketStatus[] =>
    events.flatMap((e) => (e.type === "status" ? [e.status] : []));
  return { socket, ioCalls, client, events, statuses };
}

describe("audiobookshelf socket", () => {
  test("connects to the origin only, with the socket.io path", () => {
    const { ioCalls } = setup("https://host:8443/audiobookshelf/");
    expect(ioCalls).toEqual([
      { uri: "https://host:8443", opts: { path: "/socket.io" } },
    ]);
  });

  test("happy path: connecting -> auth emitted on connect -> authenticated on init", () => {
    const { socket, statuses } = setup();
    expect(statuses()).toEqual(["connecting"]);

    socket.fire("connect");
    expect(socket.authEmits()).toEqual([[API_KEY]]);
    expect(statuses()).toEqual(["connecting"]);

    socket.fire("init", { user: {} });
    expect(statuses()).toEqual(["connecting", "authenticated"]);
  });

  test("disconnect -> reconnecting; next connect re-authenticates; init -> authenticated", () => {
    const { socket, statuses } = setup();
    socket.fire("connect");
    socket.fire("init");

    socket.fire("disconnect", "transport close");
    expect(statuses().at(-1)).toBe("reconnecting");

    socket.fire("connect");
    expect(socket.authEmits()).toEqual([[API_KEY], [API_KEY]]);
    expect(statuses().at(-1)).toBe("reconnecting");

    socket.fire("init");
    expect(statuses()).toEqual([
      "connecting",
      "authenticated",
      "reconnecting",
      "authenticated",
    ]);
    expect(socket.disconnectCalls).toBe(0);
  });

  test.each(["invalid_token", "auth_failed"])(
    "%s -> rejected, socket disconnected, no retry or re-auth",
    (rejection) => {
      const { socket, statuses } = setup();
      socket.fire("connect");
      socket.fire(rejection);

      expect(statuses()).toEqual(["connecting", "rejected"]);
      expect(socket.disconnectCalls).toBe(1);

      socket.fire("disconnect", "io client disconnect");
      socket.fire("connect");
      expect(statuses().at(-1)).toBe("rejected");
      expect(socket.authEmits()).toEqual([[API_KEY]]); // only the first
    },
  );

  test("a valid progress report becomes a tick stamped with the injected clock", () => {
    const { socket, events } = setup("https://host/", () => 4242);
    socket.fire("user_item_progress_updated", {
      id: "progress-1",
      data: {
        libraryItemId: "li_abc",
        currentTime: 123.5,
        duration: 3600,
        isFinished: false,
      },
    });
    expect(events.at(-1)).toEqual({
      type: "tick",
      tick: {
        itemId: "li_abc",
        audioPosition: 123.5,
        duration: 3600,
        receivedAt: 4242,
      },
    });
  });

  test.each([
    ["missing", {}],
    ["null", { duration: null }],
  ])("a %s duration yields a null duration", (_name, extra) => {
    const { socket, events } = setup();
    socket.fire("user_item_progress_updated", {
      data: { libraryItemId: "li_abc", currentTime: 5, ...extra },
    });
    expect(events.at(-1)).toMatchObject({
      type: "tick",
      tick: { duration: null },
    });
  });

  test.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "nope"],
    ["no data", {}],
    ["null data", { data: null }],
    ["missing libraryItemId", { data: { currentTime: 1 } }],
    ["numeric libraryItemId", { data: { libraryItemId: 7, currentTime: 1 } }],
    ["missing currentTime", { data: { libraryItemId: "li_abc" } }],
    [
      "string currentTime",
      { data: { libraryItemId: "li_abc", currentTime: "1" } },
    ],
    [
      "string duration",
      { data: { libraryItemId: "li_abc", currentTime: 1, duration: "9" } },
    ],
  ])("a malformed progress report is ignored: %s", (_name, payload) => {
    const { socket, events } = setup();
    expect(() =>
      socket.fire("user_item_progress_updated", payload),
    ).not.toThrow();
    expect(events).toEqual([{ type: "status", status: "connecting" }]);
  });

  test("ticks are not replayed to late subscribers; the current status is", () => {
    const { socket, client } = setup();
    socket.fire("init");
    socket.fire("user_item_progress_updated", {
      data: { libraryItemId: "li_abc", currentTime: 5 },
    });

    const late: SocketEvent[] = [];
    client.subscribe((e) => late.push(e));
    expect(late).toEqual([{ type: "status", status: "authenticated" }]);
  });

  test("status events are emitted only on change", () => {
    const { socket, statuses } = setup();
    socket.fire("init");
    socket.fire("init");
    socket.fire("disconnect", "transport close");
    socket.fire("disconnect", "transport close");
    expect(statuses()).toEqual(["connecting", "authenticated", "reconnecting"]);
  });

  test("close disconnects (idempotently) and silences every listener", () => {
    const { socket, client, events } = setup();
    socket.fire("connect");
    const before = events.length;

    client.close();
    client.close();
    expect(socket.disconnectCalls).toBe(1);

    socket.fire("init");
    socket.fire("disconnect", "io client disconnect");
    socket.fire("user_item_progress_updated", {
      data: { libraryItemId: "li_abc", currentTime: 5 },
    });
    expect(events.length).toBe(before);
  });

  test("unsubscribe stops delivery to that listener only", () => {
    const { socket, client, events } = setup();
    const other: SocketEvent[] = [];
    const unsubscribe = client.subscribe((e) => other.push(e));
    unsubscribe();

    socket.fire("init");
    expect(other).toEqual([{ type: "status", status: "connecting" }]);
    expect(events.at(-1)).toEqual({ type: "status", status: "authenticated" });
  });

  test("the API key never appears in events and nothing is logged", () => {
    const logged: unknown[] = [];
    const methods = ["log", "info", "warn", "error", "debug"] as const;
    const originals = methods.map((m) => console[m]);
    for (const m of methods) console[m] = (...args) => void logged.push(args);
    try {
      const { socket, events } = setup();
      socket.fire("connect");
      socket.fire("init");
      socket.fire("user_item_progress_updated", { data: "malformed" });
      socket.fire("invalid_token");
      expect(JSON.stringify(events)).not.toContain(API_KEY);
      expect(logged).toEqual([]);
    } finally {
      methods.forEach((m, i) => (console[m] = originals[i]!));
    }
  });
});
