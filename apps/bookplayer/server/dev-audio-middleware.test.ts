import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Server } from "node:http";
import type {
  AudioBufferPool,
  AudioChunkWriter,
  AudioFileOpener,
} from "./dev-audio-middleware.ts";

import {
  createAudioBufferPool,
  createDevAudioMiddleware,
} from "./dev-audio-middleware.ts";

const BOOK_ID = "0123456789ab";
const tempDirs: Array<string> = [];
const servers: Array<Server> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeAudio(bytes = 64): string {
  const dir = mkdtempSync(join(tmpdir(), "dev-audio-middleware-"));
  tempDirs.push(dir);
  const path = join(dir, "book.m4b");
  writeFileSync(
    path,
    Uint8Array.from({ length: bytes }, (_, index) => index % 251),
  );
  return path;
}

async function startServer(options: {
  path: string;
  openFile?: AudioFileOpener;
  writeChunk?: AudioChunkWriter;
  bufferPool?: AudioBufferPool;
}): Promise<string> {
  const middleware = createDevAudioMiddleware({
    resolveAudio: () => options.path,
    openFile: options.openFile,
    writeChunk: options.writeChunk,
    bufferPool: options.bufferPool,
  });
  const server = createServer((req, res) => {
    middleware(req, res, () => {
      res.statusCode = 418;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ next: true }));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not bind a TCP port");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function responseBytes(response: Response): Promise<Array<number>> {
  return Array.from(new Uint8Array(await response.arrayBuffer()));
}

describe("direct development audio middleware", () => {
  test.each([
    {
      name: "full",
      range: undefined,
      status: 200,
      contentRange: null,
      expected: Array.from({ length: 64 }, (_, index) => index),
    },
    {
      name: "bounded",
      range: "bytes=5-12",
      status: 206,
      contentRange: "bytes 5-12/64",
      expected: [5, 6, 7, 8, 9, 10, 11, 12],
    },
    {
      name: "open-ended",
      range: "bytes=56-",
      status: 206,
      contentRange: "bytes 56-63/64",
      expected: [56, 57, 58, 59, 60, 61, 62, 63],
    },
    {
      name: "suffix",
      range: "bytes=-8",
      status: 206,
      contentRange: "bytes 56-63/64",
      expected: [56, 57, 58, 59, 60, 61, 62, 63],
    },
    {
      name: "overlong end",
      range: "bytes=60-999",
      status: 206,
      contentRange: "bytes 60-63/64",
      expected: [60, 61, 62, 63],
    },
  ])("serves $name bytes and exact headers", async (fixture) => {
    const url = await startServer({ path: makeAudio() });
    const response = await fetch(`${url}/api/audio/${BOOK_ID}`, {
      headers: fixture.range ? { Range: fixture.range } : undefined,
    });

    expect(response.status).toBe(fixture.status);
    expect(response.headers.get("Content-Type")).toBe("audio/mp4");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Range")).toBe(fixture.contentRange);
    expect(response.headers.get("Content-Length")).toBe(
      String(fixture.expected.length),
    );
    expect(response.headers.get("Server-Timing")).toContain("file;dur=");
    expect(await responseBytes(response)).toEqual([...fixture.expected]);
  });

  test("returns structured 416 without opening the file", async () => {
    let openCalls = 0;
    const url = await startServer({
      path: makeAudio(),
      openFile: (path) => {
        openCalls += 1;
        return open(path, "r");
      },
    });
    const response = await fetch(`${url}/api/audio/${BOOK_ID}`, {
      headers: { Range: "bytes=999-" },
    });

    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */64");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "RANGE_NOT_SATISFIABLE",
        message: "Range not satisfiable.",
      },
    });
    expect(openCalls).toBe(0);
  });

  test("HEAD sends GET-equivalent range headers without opening the file", async () => {
    let openCalls = 0;
    const url = await startServer({
      path: makeAudio(),
      openFile: (path) => {
        openCalls += 1;
        return open(path, "r");
      },
    });
    const response = await fetch(`${url}/api/audio/${BOOK_ID}`, {
      method: "HEAD",
      headers: { Range: "bytes=5-12" },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 5-12/64");
    expect(response.headers.get("Content-Length")).toBe("8");
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    expect(openCalls).toBe(0);
  });

  test.each([
    { path: `/api/cover/${BOOK_ID}`, method: "GET" },
    { path: `/api/audio/${BOOK_ID}`, method: "POST" },
  ])("passes $method $path to later middleware", async (fixture) => {
    const url = await startServer({ path: makeAudio() });
    const response = await fetch(`${url}${fixture.path}`, {
      method: fixture.method,
    });

    expect(response.status).toBe(418);
    expect(await response.json()).toEqual({ next: true });
  });

  test("closes a slow client's file handle before EOF on disconnect", async () => {
    const path = makeAudio(1);
    const fileSize = 32 * 1024 * 1024;
    truncateSync(path, fileSize);
    let handleClosed = false;
    let reachedEof = false;
    let bytesRead = 0;
    let bufferReleases = 0;
    const innerPool = createAudioBufferPool(1);
    const url = await startServer({
      path,
      bufferPool: {
        acquire: innerPool.acquire,
        release(buffer) {
          bufferReleases += 1;
          innerPool.release(buffer);
        },
      },
      openFile: async (filePath) => {
        const handle = await open(filePath, "r");
        return {
          async read(buffer, offset, length, position) {
            const result = await handle.read(buffer, offset, length, position);
            bytesRead += result.bytesRead;
            if (bytesRead >= fileSize) reachedEof = true;
            return result;
          },
          async close() {
            handleClosed = true;
            await handle.close();
          },
        };
      },
    });

    await new Promise<void>((resolve, reject) => {
      const request = httpRequest(
        `${url}/api/audio/${BOOK_ID}`,
        { headers: { Range: "bytes=0-" } },
        (response) => {
          response.once("data", () => {
            request.destroy();
            resolve();
          });
        },
      );
      request.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ECONNRESET") resolve();
        else reject(error);
      });
      request.end();
    });

    await waitFor(() => handleClosed);
    await waitFor(() => bufferReleases === 1);
    expect(reachedEof).toBe(false);
    expect(bytesRead).toBeLessThan(fileSize);
  });

  test("serializes one reusable buffer across read and write", async () => {
    const fileSize = 3 * 64 * 1024 + 17;
    const path = makeAudio(fileSize);
    let handleClosed = false;
    let writeOutstanding = 0;
    let maxWriteOutstanding = 0;
    let readDuringWrite = false;
    let bufferMutatedDuringWrite = false;
    const backingBuffers = new Set<ArrayBufferLike>();

    const url = await startServer({
      path,
      openFile: async (filePath) => {
        const handle = await open(filePath, "r");
        return {
          async read(buffer, offset, length, position) {
            if (writeOutstanding > 0) readDuringWrite = true;
            return handle.read(buffer, offset, length, position);
          },
          async close() {
            handleClosed = true;
            await handle.close();
          },
        };
      },
      writeChunk: async (res, chunk, stopped) => {
        writeOutstanding += 1;
        maxWriteOutstanding = Math.max(maxWriteOutstanding, writeOutstanding);
        backingBuffers.add(chunk.buffer);
        const snapshot = Buffer.from(chunk);
        await Bun.sleep(2);
        if (!Buffer.from(chunk).equals(snapshot)) {
          bufferMutatedDuringWrite = true;
        }
        try {
          await new Promise<void>((resolve, reject) => {
            res.write(chunk, (error) => (error ? reject(error) : resolve()));
          });
          return !stopped.aborted;
        } finally {
          writeOutstanding -= 1;
        }
      },
    });

    const response = await fetch(`${url}/api/audio/${BOOK_ID}`);
    expect((await response.arrayBuffer()).byteLength).toBe(fileSize);
    await waitFor(() => handleClosed);
    expect(maxWriteOutstanding).toBe(1);
    expect(readDuringWrite).toBe(false);
    expect(bufferMutatedDuringWrite).toBe(false);
    expect(backingBuffers.size).toBe(1);
  });

  test("reuses one pooled buffer across sequential requests", async () => {
    const path = makeAudio(64 * 1024 + 17);
    const readBuffers = new Set<ArrayBufferLike>();
    const bufferPool = createAudioBufferPool(1);
    const url = await startServer({
      path,
      bufferPool,
      openFile: async (filePath) => {
        const handle = await open(filePath, "r");
        return {
          read(buffer, offset, length, position) {
            readBuffers.add(buffer.buffer);
            return handle.read(buffer, offset, length, position);
          },
          close: () => handle.close(),
        };
      },
    });

    for (let request = 0; request < 3; request++) {
      const response = await fetch(`${url}/api/audio/${BOOK_ID}`, {
        headers: { Range: "bytes=0-65552" },
      });
      expect((await response.arrayBuffer()).byteLength).toBe(64 * 1024 + 17);
    }

    expect(readBuffers.size).toBe(1);
  });

  test("does not return an active write buffer to the pool", async () => {
    const path = makeAudio(64);
    const innerPool = createAudioBufferPool(1);
    const acquired: Array<Uint8Array> = [];
    const released: Array<Uint8Array> = [];
    const bufferPool: AudioBufferPool = {
      acquire() {
        const buffer = innerPool.acquire();
        acquired.push(buffer);
        return buffer;
      },
      release(buffer) {
        released.push(buffer);
        innerPool.release(buffer);
      },
    };
    const pendingWrites: Array<() => void> = [];
    const url = await startServer({
      path,
      bufferPool,
      writeChunk: async (res, chunk) => {
        await new Promise<void>((resolve, reject) => {
          res.write(chunk, (error) => (error ? reject(error) : resolve()));
        });
        await new Promise<void>((resolve) => pendingWrites.push(resolve));
        return true;
      },
    });

    const first = fetch(`${url}/api/audio/${BOOK_ID}`);
    await waitFor(() => pendingWrites.length === 1);
    const second = fetch(`${url}/api/audio/${BOOK_ID}`);
    await waitFor(() => pendingWrites.length === 2);

    expect(acquired).toHaveLength(2);
    expect(acquired[0]).not.toBe(acquired[1]);
    expect(released).toHaveLength(0);

    pendingWrites.splice(0).forEach((resolve) => resolve());
    await Promise.all([first, second]);
    await waitFor(() => released.length === 2);

    const third = await fetch(`${url}/api/audio/${BOOK_ID}`);
    await waitFor(() => pendingWrites.length === 1);
    pendingWrites.shift()?.();
    await third.arrayBuffer();
    expect(released.slice(0, 2).some((buffer) => buffer === acquired[2])).toBe(
      true,
    );
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 3000;
  while (!predicate()) {
    if (performance.now() >= deadline) {
      throw new Error("timed out waiting for development audio cleanup");
    }
    await Bun.sleep(10);
  }
}
