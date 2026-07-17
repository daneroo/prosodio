import { open } from "node:fs/promises";

import type { ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

import type { AudioResponseDescriptor } from "#/lib/media";

import { describeAudioResponse } from "#/lib/media";
import { resolveAsset } from "#/server/assets";

const AUDIO_PATH_RE = /^\/api\/audio\/([^/]+)$/;
const FILE_CHUNK_BYTES = 64 * 1024;

export type AudioFileHandle = {
  read: (
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ) => Promise<{ bytesRead: number }>;
  close: () => Promise<void>;
};

export type AudioFileOpener = (absPath: string) => Promise<AudioFileHandle>;

export type AudioChunkWriter = (
  res: ServerResponse,
  chunk: Uint8Array,
  stopped: AbortSignal,
) => Promise<boolean>;

export type AudioBufferPool = {
  acquire: () => Uint8Array;
  release: (buffer: Uint8Array) => void;
};

type DevAudioMiddlewareOptions = {
  resolveAudio?: (bookId: string) => string | Response;
  openFile?: AudioFileOpener;
  writeChunk?: AudioChunkWriter;
  bufferPool?: AudioBufferPool;
};

const audioBufferPool = createAudioBufferPool();

/** Keep development's large native buffers bounded by peak concurrency. */
export function createAudioBufferPool(maxIdle = 4): AudioBufferPool {
  const idle: Array<Uint8Array> = [];
  return {
    acquire: () => idle.pop() ?? Buffer.allocUnsafe(FILE_CHUNK_BYTES),
    release(buffer): void {
      if (buffer.byteLength === FILE_CHUNK_BYTES && idle.length < maxIdle) {
        idle.push(buffer);
      }
    },
  };
}

/** Serve successful development audio without a Web Request/Response adapter. */
export function createDevAudioMiddleware(
  options: DevAudioMiddlewareOptions = {},
): Connect.NextHandleFunction {
  const resolveAudio =
    options.resolveAudio ?? ((bookId) => resolveAsset("audio", bookId));
  const openFile = options.openFile ?? ((absPath) => open(absPath, "r"));
  const writeChunk = options.writeChunk ?? writeResponseChunk;
  const bufferPool = options.bufferPool ?? audioBufferPool;

  return (req, res, next) => {
    const method = req.method?.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      next();
      return;
    }

    const match = requestPath(req.url)?.match(AUDIO_PATH_RE);
    const bookId = match?.[1];
    if (!bookId) {
      next();
      return;
    }

    const resolved = resolveAudio(bookId);
    if (resolved instanceof Response) {
      void copyErrorResponse(resolved, res, method === "HEAD").catch(next);
      return;
    }

    const rangeHeader =
      typeof req.headers.range === "string" ? req.headers.range : null;
    const descriptor = describeAudioResponse(resolved, rangeHeader);
    if (descriptor instanceof Response) {
      void copyErrorResponse(descriptor, res, method === "HEAD").catch(next);
      return;
    }

    res.statusCode = descriptor.status;
    for (const [name, value] of Object.entries(descriptor.headers)) {
      res.setHeader(name, value);
    }
    if (method === "HEAD") {
      res.end();
      return;
    }

    void pumpAudio(
      req,
      res,
      resolved,
      descriptor,
      openFile,
      writeChunk,
      bufferPool,
    );
  };
}

/** Install before Nitro so development audio never enters env-runner. */
export function devAudioMiddleware(): Plugin {
  return {
    name: "bookplayer-direct-dev-audio",
    apply: "serve",
    enforce: "pre",
    configureServer(server): void {
      server.middlewares.use(createDevAudioMiddleware());
    },
  };
}

function requestPath(requestUrl: string | undefined): string | undefined {
  if (!requestUrl) return undefined;
  try {
    return new URL(requestUrl, "http://localhost").pathname;
  } catch {
    return undefined;
  }
}

async function copyErrorResponse(
  response: Response,
  res: ServerResponse,
  head: boolean,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (head) {
    res.end();
    return;
  }
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function pumpAudio(
  req: Connect.IncomingMessage,
  res: ServerResponse,
  absPath: string,
  descriptor: AudioResponseDescriptor,
  openFile: AudioFileOpener,
  writeChunk: AudioChunkWriter,
  bufferPool: AudioBufferPool,
): Promise<void> {
  const stopped = new AbortController();
  let handle: AudioFileHandle | undefined;
  let buffer: Uint8Array | undefined;
  const stop = (): void => stopped.abort();
  const isStopped = (): boolean => stopped.signal.aborted;
  const onResponseClose = (): void => {
    if (!res.writableFinished) stop();
  };

  req.once("aborted", stop);
  res.once("close", onResponseClose);
  try {
    handle = await openFile(absPath);
    if (isStopped()) return;

    buffer = bufferPool.acquire();
    let position = descriptor.range?.start ?? 0;
    const end = descriptor.range?.end ?? descriptor.fileSize - 1;

    while (!isStopped() && position <= end) {
      const readLength = Math.min(buffer.length, end - position + 1);
      const { bytesRead } = await handle.read(buffer, 0, readLength, position);
      if (isStopped() || bytesRead === 0) break;

      position += bytesRead;
      const written = await writeChunk(
        res,
        buffer.subarray(0, bytesRead),
        stopped.signal,
      );
      if (!written) break;
    }

    if (!isStopped() && !res.destroyed) res.end();
  } catch {
    if (!isStopped() && !res.destroyed) res.destroy();
  } finally {
    stop();
    req.removeListener("aborted", stop);
    res.removeListener("close", onResponseClose);
    await handle?.close().catch(() => undefined);
    if (buffer) bufferPool.release(buffer);
  }
}

function writeResponseChunk(
  res: ServerResponse,
  chunk: Uint8Array,
  stopped: AbortSignal,
): Promise<boolean> {
  if (stopped.aborted || res.destroyed) return Promise.resolve(false);

  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    let callbackComplete = false;
    let drainComplete = true;

    const cleanup = (): void => {
      stopped.removeEventListener("abort", onStopped);
      res.removeListener("drain", onDrain);
    };
    const finish = (written: boolean): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(written);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const completeIfFlushed = (): void => {
      if (callbackComplete && drainComplete) finish(true);
    };
    // This signal is only raised by an aborted request or a prematurely closed
    // response, so no client can observe later reuse of its queued bytes.
    const onStopped = (): void => finish(false);
    const onDrain = (): void => {
      drainComplete = true;
      completeIfFlushed();
    };

    stopped.addEventListener("abort", onStopped, { once: true });
    try {
      const accepted = res.write(chunk, (error) => {
        if (error) {
          fail(error);
          return;
        }
        callbackComplete = true;
        completeIfFlushed();
      });
      if (!accepted) {
        drainComplete = false;
        res.once("drain", onDrain);
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error("audio write failed"));
    }
  });
}
