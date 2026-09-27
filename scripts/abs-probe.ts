#!/usr/bin/env bun
/**
 * Read-only Audiobookshelf Socket.IO diagnostic.
 *
 * Run from the repository root with untracked `.env.local` values:
 *
 *   ABS_URL=http://127.0.0.1:13378/audiobookshelf
 *   ABS_TOKEN=<the dedicated probe user's token>
 *   ABS_LIBRARY_ITEM_ID=<optional library item ID>
 *
 * `ABS_URL` is the public ABS base path, not an item URL. The socket normally
 * lives at the origin's `/socket.io`; set ABS_SOCKET_URL or ABS_SOCKET_PATH
 * only when a reverse proxy uses a different location. Ctrl-C ends the run.
 *
 * The script never sends a progress update or a playback request. Its JSONL
 * capture deliberately retains event names, timing, numeric/boolean values,
 * and payload shape while redacting all strings and binary data.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { io } from "socket.io-client";
type JsonObject = Record<string, unknown>;

interface EventRecord {
  at: string;
  kind: "event" | "lifecycle" | "rest" | "summary";
  name: string;
  detail?: unknown;
}

const absUrl = requireUrl("ABS_URL");
const token = requireEnv("ABS_TOKEN");
const libraryItemId = process.env.ABS_LIBRARY_ITEM_ID?.trim();
const socketUrl = optionalUrl("ABS_SOCKET_URL") ?? absUrl.origin;
const socketPath = process.env.ABS_SOCKET_PATH?.trim() || "/socket.io";
const durationSec = optionalPositiveNumber("ABS_PROBE_DURATION_SEC") ?? 360;
const outputPath = makeOutputPath();
const eventTimes = new Map<string, number[]>();
const streams = new Map<string, StreamDetails>();
const itemTitleLookups = new Set<string>();
let previousProgress: ProgressSample | undefined;
let closing = false;

if (import.meta.main) {
  await main();
}

async function main(): Promise<void> {
  write({
    at: new Date().toISOString(),
    kind: "lifecycle",
    name: "run_started",
    detail: {
      absBasePath: absUrl.pathname,
      socketOrigin: socketUrl,
      socketPath,
      durationSec,
      hasLibraryItemId: Boolean(libraryItemId),
    },
  });
  console.log(`ABS probe writing redacted events to ${outputPath}`);
  console.log(`Listening for up to ${durationSec}s; press Ctrl-C to stop.`);

  const socket = io(socketUrl, {
    autoConnect: false,
    path: socketPath,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 5_000,
  });

  socket.on("connect", () => {
    writeLifecycle("connect", { socketId: "<redacted>" });
    socket.emit("auth", token);
    writeLifecycle("auth_sent");
  });
  socket.on("connect_error", (error) => {
    writeLifecycle("connect_error", { message: redactText(error.message) });
  });
  socket.on("disconnect", (reason, details) => {
    writeLifecycle("disconnect", { reason, detail: describe(details) });
  });
  socket.io.on("reconnect_attempt", (attempt) => {
    writeLifecycle("reconnect_attempt", { attempt });
  });
  socket.io.on("reconnect", (attempt) => {
    writeLifecycle("reconnect", { attempt });
  });
  socket.io.on("reconnect_error", (error) => {
    writeLifecycle("reconnect_error", { message: redactText(error.message) });
  });
  socket.io.on("reconnect_failed", () => {
    writeLifecycle("reconnect_failed");
  });
  socket.onAny((name, ...args: unknown[]) => {
    writeEvent(name, args);
  });
  socket.on("init", () => {
    writeLifecycle("authenticated");
    void captureProgress();
  });
  socket.on("invalid_token", () => {
    void authenticationFailed("invalid_token");
  });
  socket.on("auth_failed", () => {
    void authenticationFailed("auth_failed");
  });

  async function authenticationFailed(
    event: "auth_failed" | "invalid_token",
  ): Promise<void> {
    writeLifecycle(event);
    process.exitCode = 1;
    await shutdown(event);
  }

  const finish = (): void => {
    void shutdown("signal");
  };
  process.once("SIGINT", finish);
  process.once("SIGTERM", finish);
  const timer = setTimeout(() => {
    void shutdown("duration_elapsed");
  }, durationSec * 1_000);

  socket.connect();

  async function shutdown(reason: string): Promise<void> {
    if (closing) return;
    closing = true;
    clearTimeout(timer);
    socket.disconnect();
    write({
      at: new Date().toISOString(),
      kind: "summary",
      name: "run_finished",
      detail: { reason, eventIntervalsMs: summarizeIntervals() },
    });
    console.log(`ABS probe finished (${reason}).`);
  }

  async function captureProgress(): Promise<void> {
    if (!libraryItemId) {
      write({
        at: new Date().toISOString(),
        kind: "rest",
        name: "progress_not_requested",
        detail: { reason: "ABS_LIBRARY_ITEM_ID is unset" },
      });
      return;
    }

    const endpoint = new URL(
      `api/me/progress/${encodeURIComponent(libraryItemId)}`,
      withTrailingSlash(absUrl),
    );
    try {
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body: unknown = await response.json().catch(() => null);
      write({
        at: new Date().toISOString(),
        kind: "rest",
        name: "progress_response",
        detail: { status: response.status, body: describe(body) },
      });
    } catch (error) {
      write({
        at: new Date().toISOString(),
        kind: "rest",
        name: "progress_error",
        detail: { message: redactError(error) },
      });
    }
  }
}

function writeEvent(name: string, args: unknown[]): void {
  const now = Date.now();
  const times = eventTimes.get(name) ?? [];
  times.push(now);
  eventTimes.set(name, times);
  write({
    at: new Date(now).toISOString(),
    kind: "event",
    name,
    detail: { args: args.map(describe) },
  });
  console.log(
    streamLifecycleLine(name, args) ??
      progressLine(args, now) ??
      `event ${name}`,
  );
  const libraryItemId = progressLibraryItemId(args);
  if (libraryItemId) void lookupItemTitle(libraryItemId);
}

function writeLifecycle(name: string, detail?: unknown): void {
  write({ at: new Date().toISOString(), kind: "lifecycle", name, detail });
  console.log(`lifecycle ${name}`);
}

function write(record: EventRecord): void {
  appendFileSync(outputPath, `${JSON.stringify(record)}\n`);
}

function describe(value: unknown, depth = 0): unknown {
  if (value === null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return "<redacted:string>";
  if (typeof value === "undefined") return "<undefined>";
  if (typeof value === "bigint") return "<redacted:bigint>";
  if (typeof value === "function") return "<function>";
  if (depth >= 6) return "<truncated>";
  if (Array.isArray(value))
    return value.map((entry) => describe(entry, depth + 1));
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, describe(entry, depth + 1)]),
    );
  }
  return `<redacted:${typeof value}>`;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

interface ProgressSample {
  receivedAtMs: number;
  currentTime: number;
}

interface StreamDetails {
  libraryItemId?: string;
  title?: string;
}

function progressLibraryItemId(args: unknown[]): string | undefined {
  if (args.length !== 1 || !isObject(args[0]) || !isObject(args[0].data)) {
    return undefined;
  }
  const libraryItemId = args[0].data.libraryItemId;
  return typeof libraryItemId === "string" ? libraryItemId : undefined;
}

async function lookupItemTitle(libraryItemId: string): Promise<void> {
  if (itemTitleLookups.has(libraryItemId)) return;
  itemTitleLookups.add(libraryItemId);

  const endpoint = new URL(
    `api/items/${encodeURIComponent(libraryItemId)}`,
    withTrailingSlash(absUrl),
  );
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body: unknown = await response.json().catch(() => null);
    const title = itemTitleFrom(body);
    write({
      at: new Date().toISOString(),
      kind: "rest",
      name: "item_title_lookup",
      detail: {
        status: response.status,
        item: describe({ libraryItemId, title }),
      },
    });
    console.log(
      title
        ? `item_info libraryItemId=${libraryItemId} title=${JSON.stringify(title)}`
        : `item_info libraryItemId=${libraryItemId} title=<unavailable> status=${response.status}`,
    );
  } catch (error) {
    write({
      at: new Date().toISOString(),
      kind: "rest",
      name: "item_title_lookup_error",
      detail: {
        item: describe({ libraryItemId }),
        message: redactError(error),
      },
    });
    console.log(
      `item_info libraryItemId=${libraryItemId} title=<lookup failed>`,
    );
  }
}

function itemTitleFrom(value: unknown): string | undefined {
  if (
    !isObject(value) ||
    !isObject(value.media) ||
    !isObject(value.media.metadata)
  ) {
    return undefined;
  }
  const title = value.media.metadata.title;
  return typeof title === "string" ? title : undefined;
}

function streamLifecycleLine(
  name: string,
  args: unknown[],
): string | undefined {
  if (name === "stream_open") {
    const details = streamDetails(args[0]);
    if (!details) return undefined;
    streams.set(details.streamId, details);
    return [
      `stream_open streamId=${details.streamId}`,
      formatOptionalField("libraryItemId", details.libraryItemId),
      formatOptionalField("title", details.title),
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (name === "stream_closed" && typeof args[0] === "string") {
    const details = streams.get(args[0]);
    streams.delete(args[0]);
    return [
      `stream_closed streamId=${args[0]}`,
      formatOptionalField("libraryItemId", details?.libraryItemId),
      formatOptionalField("title", details?.title),
    ]
      .filter(Boolean)
      .join(" ");
  }

  return undefined;
}

function streamDetails(
  value: unknown,
): (StreamDetails & { streamId: string }) | undefined {
  if (!isObject(value) || typeof value.id !== "string") return undefined;
  const libraryItem = isObject(value.libraryItem)
    ? value.libraryItem
    : undefined;
  const media =
    libraryItem && isObject(libraryItem.media) ? libraryItem.media : undefined;
  const metadata =
    media && isObject(media.metadata) ? media.metadata : undefined;
  return {
    streamId: value.id,
    libraryItemId:
      libraryItem && typeof libraryItem.id === "string"
        ? libraryItem.id
        : undefined,
    title:
      metadata && typeof metadata.title === "string"
        ? metadata.title
        : undefined,
  };
}

function formatOptionalField(name: string, value: string | undefined): string {
  return value ? `${name}=${JSON.stringify(value)}` : "";
}

function progressLine(
  args: unknown[],
  receivedAtMs: number,
): string | undefined {
  if (args.length !== 1 || !isObject(args[0]) || !isObject(args[0].data)) {
    return undefined;
  }

  const data = args[0].data;
  if (
    typeof data.libraryItemId !== "string" ||
    typeof data.currentTime !== "number"
  ) {
    return undefined;
  }

  const current: ProgressSample = {
    receivedAtMs,
    currentTime: data.currentTime,
  };
  const previous = previousProgress;
  previousProgress = current;

  const position = formatSeconds(current.currentTime);
  if (!previous) {
    return `progress libraryItemId=${data.libraryItemId} currentTime=${position} estimatedRate=warming-up`;
  }

  const realSeconds = (current.receivedAtMs - previous.receivedAtMs) / 1_000;
  const streamSeconds = current.currentTime - previous.currentTime;
  const rate = realSeconds > 0 ? streamSeconds / realSeconds : NaN;
  const estimatedRate = isPlausibleRate(rate)
    ? `${formatRate(roundRate(rate))}x`
    : "unknown (seek or pause)";
  return [
    `progress libraryItemId=${data.libraryItemId}`,
    `currentTime=${position}`,
    `derivedStreamDelta=${formatSignedSeconds(streamSeconds)}`,
    `derivedRealDelta=${formatSignedSeconds(realSeconds)}`,
    `estimatedRate=${estimatedRate}`,
  ].join(" ");
}

function isPlausibleRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0 && rate <= 4;
}

function roundRate(rate: number): number {
  return Math.round(rate * 20) / 20;
}

function formatRate(rate: number): string {
  return String(Number(rate.toFixed(2)));
}

function formatSeconds(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const absolute = Math.abs(seconds);
  const hours = Math.floor(absolute / 3_600);
  const minutes = Math.floor((absolute % 3_600) / 60);
  const remainingSeconds = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${remainingSeconds.toFixed(2).padStart(5, "0")}`;
}

function formatSignedSeconds(seconds: number): string {
  return `${seconds >= 0 ? "+" : ""}${seconds.toFixed(2)}s`;
}

function summarizeIntervals(): Record<string, number[]> {
  return Object.fromEntries(
    [...eventTimes.entries()].map(([name, times]) => [
      name,
      times.slice(1).map((time, index) => time - (times[index] ?? time)),
    ]),
  );
}

function makeOutputPath(): string {
  const directory = join(import.meta.dir, "..", "data", "abs-probe");
  mkdirSync(directory, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  return join(directory, `socket-${timestamp}.jsonl`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set in the local environment`);
  return value;
}

function requireUrl(name: string): URL {
  return parseUrl(name, requireEnv(name));
}

function optionalUrl(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? parseUrl(name, value).origin : undefined;
}

function parseUrl(name: string, value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
}

function optionalPositiveNumber(name: string): number | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name} must be a positive number of seconds`);
  }
  return number;
}

function withTrailingSlash(url: URL): string {
  return url.pathname.endsWith("/") ? url.href : `${url.href}/`;
}

function redactError(error: unknown): string {
  return redactText(error instanceof Error ? error.message : String(error));
}

function redactText(value: string): string {
  return value.replaceAll(token, "<redacted:token>");
}
