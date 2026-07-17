import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { open } from "node:fs/promises";
import { createConnection, createServer } from "node:net";

import {
  BOOK_ID_RE,
  createAudioSourceCache,
  describeAudioResponse,
  parseRangeHeader,
  rawFileBody,
  safeResolve,
  serveFile,
  serveStreamedWithRange,
} from "./media.ts";

const tempDirs: Array<string> = [];

function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function rangeRequest(range?: string): Request {
  return new Request(
    "http://localhost/api/audio/x",
    range ? { headers: { Range: range } } : undefined,
  );
}

describe("audio source cache", () => {
  test("reuses one source until the file version changes", () => {
    let creations = 0;
    const cache = createAudioSourceCache(2, (path) => {
      creations += 1;
      return new Blob([path]);
    });

    const first = cache.get("/audio/a.m4b", "version-1");
    expect(cache.get("/audio/a.m4b", "version-1")).toBe(first);
    expect(creations).toBe(1);

    const replaced = cache.get("/audio/a.m4b", "version-2");
    expect(replaced).not.toBe(first);
    expect(creations).toBe(2);
    expect(cache.size).toBe(1);
  });

  test("keeps only the most recently used bounded set", () => {
    const creations: Array<string> = [];
    const cache = createAudioSourceCache(2, (path) => {
      creations.push(path);
      return new Blob([path]);
    });

    const a = cache.get("a", "1");
    cache.get("b", "1");
    expect(cache.get("a", "1")).toBe(a);
    cache.get("c", "1");
    cache.get("b", "1");

    expect(cache.size).toBe(2);
    expect(creations).toEqual(["a", "b", "c", "b"]);
  });

  test("rejects an unbounded or empty configuration", () => {
    expect(() => createAudioSourceCache(0)).toThrow(RangeError);
    expect(() => createAudioSourceCache(Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});

describe("safeResolve", () => {
  test("resolves a real file inside the root", () => {
    const root = makeDir("media-root-");
    writeFileSync(join(root, "book.m4b"), "audio");
    expect(safeResolve(root, "book.m4b")).toBeTruthy();
  });

  test("refuses .. traversal", () => {
    const base = makeDir("media-base-");
    const root = join(base, "root");
    mkdirSync(root);
    writeFileSync(join(base, "secret.txt"), "secret");
    expect(safeResolve(root, "../secret.txt")).toBeNull();
  });

  test("refuses separator-prefix collisions", () => {
    const base = makeDir("media-base-");
    const root = join(base, "root");
    mkdirSync(root);
    mkdirSync(join(base, "root-evil"));
    writeFileSync(join(base, "root-evil", "file.txt"), "evil");
    expect(safeResolve(root, join("..", "root-evil", "file.txt"))).toBeNull();
  });

  test("refuses symlink escape", () => {
    const base = makeDir("media-base-");
    const root = join(base, "root");
    mkdirSync(root);
    writeFileSync(join(base, "outside.txt"), "outside");
    symlinkSync(join(base, "outside.txt"), join(root, "inside.txt"));
    expect(safeResolve(root, "inside.txt")).toBeNull();
  });

  test("missing files resolve to null (404 upstream, not a throw)", () => {
    const root = makeDir("media-root-");
    expect(safeResolve(root, "absent.m4b")).toBeNull();
  });
});

describe("parseRangeHeader", () => {
  const SIZE = 10_000;

  test("no header or non-bytes units mean full file", () => {
    expect(parseRangeHeader(null, SIZE)).toBeNull();
    expect(parseRangeHeader("items=0-9", SIZE)).toBeNull();
  });

  test("multi-range is ignored (full file), per HTTP's may-ignore rule", () => {
    expect(parseRangeHeader("bytes=0-99,200-299", SIZE)).toBeNull();
  });

  test("bounded, open-ended, and suffix ranges", () => {
    expect(parseRangeHeader("bytes=0-1023", SIZE)).toEqual({
      start: 0,
      end: 1023,
    });
    expect(parseRangeHeader("bytes=1024-", SIZE)).toEqual({
      start: 1024,
      end: SIZE - 1,
    });
    expect(parseRangeHeader("bytes=-500", SIZE)).toEqual({
      start: SIZE - 500,
      end: SIZE - 1,
    });
  });

  test("end clamps to the file size", () => {
    expect(parseRangeHeader(`bytes=0-${SIZE * 2}`, SIZE)).toEqual({
      start: 0,
      end: SIZE - 1,
    });
  });

  test("malformed and out-of-bounds ranges are unsatisfiable", () => {
    expect(parseRangeHeader("bytes=", SIZE)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=abc", SIZE)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=-", SIZE)).toBe("unsatisfiable");
    expect(parseRangeHeader(`bytes=${SIZE}-`, SIZE)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=500-100", SIZE)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=-0", SIZE)).toBe("unsatisfiable");
  });
});

describe("serveStreamedWithRange", () => {
  function makeAudio(bytes: number): string {
    const root = makeDir("media-audio-");
    const path = join(root, "book.m4b");
    writeFileSync(
      path,
      Uint8Array.from({ length: bytes }, (_, index) => index % 251),
    );
    return path;
  }

  async function responseBytes(response: Response): Promise<Array<number>> {
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  }

  test.each([
    {
      name: "absent",
      range: null,
      status: 200,
      contentRange: undefined,
      contentLength: 64,
      parsedRange: undefined,
    },
    {
      name: "bounded",
      range: "bytes=5-12",
      status: 206,
      contentRange: "bytes 5-12/64",
      contentLength: 8,
      parsedRange: { start: 5, end: 12 },
    },
    {
      name: "open-ended",
      range: "bytes=56-",
      status: 206,
      contentRange: "bytes 56-63/64",
      contentLength: 8,
      parsedRange: { start: 56, end: 63 },
    },
    {
      name: "suffix",
      range: "bytes=-8",
      status: 206,
      contentRange: "bytes 56-63/64",
      contentLength: 8,
      parsedRange: { start: 56, end: 63 },
    },
    {
      name: "overlong end",
      range: "bytes=60-999",
      status: 206,
      contentRange: "bytes 60-63/64",
      contentLength: 4,
      parsedRange: { start: 60, end: 63 },
    },
  ])("$name descriptor pins protocol without a body", (fixture) => {
    const descriptor = describeAudioResponse(makeAudio(64), fixture.range);
    if (descriptor instanceof Response) {
      throw new Error(`unexpected descriptor error: ${descriptor.status}`);
    }
    expect(descriptor.status).toBe(fixture.status);
    expect(descriptor.headers["Content-Range"]).toBe(fixture.contentRange);
    expect(descriptor.headers["Content-Length"]).toBe(
      String(fixture.contentLength),
    );
    expect(descriptor.headers["Accept-Ranges"]).toBe("bytes");
    expect(descriptor.range).toEqual(fixture.parsedRange);
  });

  test("full response has exact Content-Length and Accept-Ranges", async () => {
    const path = makeAudio(4096);
    const res = serveStreamedWithRange(path, rangeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("4096");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Server-Timing")).toContain("file;dur=");
    expect(await responseBytes(res)).toEqual(
      Array.from({ length: 4096 }, (_, index) => index % 251),
    );
  });

  test("Bun file bodies preserve full and end-exclusive sliced bytes", async () => {
    const path = makeAudio(64);
    const full = serveStreamedWithRange(path, rangeRequest(), "bun-file");
    expect(full.status).toBe(200);
    expect(full.headers.get("Content-Length")).toBe("64");
    expect(await responseBytes(full)).toEqual(
      Array.from({ length: 64 }, (_, index) => index),
    );

    const sliced = serveStreamedWithRange(
      path,
      rangeRequest("bytes=5-12"),
      "bun-file",
    );
    expect(sliced.status).toBe(206);
    expect(sliced.headers.get("Content-Range")).toBe("bytes 5-12/64");
    expect(sliced.headers.get("Content-Length")).toBe("8");
    expect(await responseBytes(sliced)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  test("Bun source reuse invalidates after a same-path file replacement", async () => {
    const path = makeAudio(64);
    const firstDescriptor = describeAudioResponse(path, null);
    if (firstDescriptor instanceof Response) {
      throw new Error(`unexpected descriptor error: ${firstDescriptor.status}`);
    }
    const first = serveStreamedWithRange(path, rangeRequest(), "bun-file");
    expect((await first.arrayBuffer()).byteLength).toBe(64);

    writeFileSync(path, Buffer.alloc(64, 7));
    const future = new Date(Date.now() + 10_000);
    utimesSync(path, future, future);
    const secondDescriptor = describeAudioResponse(path, null);
    if (secondDescriptor instanceof Response) {
      throw new Error(
        `unexpected descriptor error: ${secondDescriptor.status}`,
      );
    }
    expect(secondDescriptor.fileVersion).not.toBe(firstDescriptor.fileVersion);

    const second = serveStreamedWithRange(path, rangeRequest(), "bun-file");
    expect(await responseBytes(second)).toEqual(Array(64).fill(7));
  });

  test.each([
    {
      name: "bounded",
      range: "bytes=5-12",
      contentRange: "bytes 5-12/64",
      expected: Array.from({ length: 8 }, (_, index) => index + 5),
    },
    {
      name: "open-ended",
      range: "bytes=56-",
      contentRange: "bytes 56-63/64",
      expected: Array.from({ length: 8 }, (_, index) => index + 56),
    },
    {
      name: "suffix",
      range: "bytes=-8",
      contentRange: "bytes 56-63/64",
      expected: Array.from({ length: 8 }, (_, index) => index + 56),
    },
    {
      name: "overlong end clamped to EOF",
      range: "bytes=60-999",
      contentRange: "bytes 60-63/64",
      expected: [60, 61, 62, 63],
    },
  ])("$name range pins headers and exact body bytes", async (fixture) => {
    const path = makeAudio(64);
    const res = serveStreamedWithRange(
      path,
      rangeRequest(fixture.range),
      "bounded-stream",
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(fixture.contentRange);
    expect(res.headers.get("Content-Length")).toBe(
      String(fixture.expected.length),
    );
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(await responseBytes(res)).toEqual([...fixture.expected]);
  });

  test("describes a broad requested interval exactly without materializing it", async () => {
    const root = makeDir("media-audio-sparse-");
    const path = join(root, "book.m4b");
    const fileSize = 3_145_829;
    const start = 4_096;
    const end = 2_500_123;
    writeFileSync(path, "fixture");
    truncateSync(path, fileSize);
    const res = serveStreamedWithRange(
      path,
      rangeRequest(`bytes=${start}-${end}`),
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes ${start}-${end}/${fileSize}`,
    );
    expect(res.headers.get("Content-Length")).toBe(String(end - start + 1));
    await res.body?.cancel();
  });

  test.each(["bytes=abc", "bytes=99999-"])(
    "malformed or unsatisfiable range %s returns a structured 416",
    async (range) => {
      const path = makeAudio(64);
      const res = serveStreamedWithRange(path, rangeRequest(range));
      expect(res.status).toBe(416);
      expect(res.headers.get("Content-Range")).toBe("bytes */64");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toEqual({
        error: {
          code: "RANGE_NOT_SATISFIABLE",
          message: "Range not satisfiable.",
        },
      });
    },
  );

  test("a non-bytes range is ignored as a full response", async () => {
    const path = makeAudio(4096);
    const res = serveStreamedWithRange(path, rangeRequest("items=0-7"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Range")).toBeNull();
    expect(res.headers.get("Content-Length")).toBe("4096");
    expect((await res.arrayBuffer()).byteLength).toBe(4096);
  });

  test("missing file returns structured 404", async () => {
    const root = makeDir("media-root-");
    const res = serveStreamedWithRange(join(root, "gone.m4b"), rangeRequest());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ASSET_MISSING");
  });
});

describe("serveFile", () => {
  test("Content-Length matches the payload byte for byte", async () => {
    const root = makeDir("media-root-");
    const path = join(root, "book.epub");
    writeFileSync(path, Buffer.alloc(2222, 3));
    const res = serveFile(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/epub+zip");
    expect(res.headers.get("Content-Length")).toBe("2222");
    expect((await res.arrayBuffer()).byteLength).toBe(2222);
  });
});

describe("rawFileBody", () => {
  test("reads an exact inclusive range", async () => {
    const root = makeDir("media-range-body-");
    const path = join(root, "asset.bin");
    writeFileSync(path, Uint8Array.from([0, 1, 2, 3, 4, 5]));

    const response = new Response(rawFileBody(path, { start: 2, end: 4 }));
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      2, 3, 4,
    ]);
  });

  test("fills BYOB views directly across an exact range", async () => {
    const root = makeDir("media-byob-body-");
    const path = join(root, "asset.bin");
    writeFileSync(path, Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]));
    const reader = rawFileBody(path, { start: 2, end: 6 }).getReader({
      mode: "byob",
    });

    const firstBuffer = new Uint8Array(3);
    const firstBacking = firstBuffer.buffer;
    const first = await reader.read(firstBuffer);
    expect(first.done).toBe(false);
    expect(first.value?.buffer).toBe(firstBacking);
    expect(Array.from(first.value ?? [])).toEqual([2, 3, 4]);

    const secondBuffer = new Uint8Array(8);
    const secondBacking = secondBuffer.buffer;
    const second = await reader.read(secondBuffer);
    expect(second.done).toBe(false);
    expect(second.value?.buffer).toBe(secondBacking);
    expect(Array.from(second.value ?? [])).toEqual([5, 6]);

    const end = await reader.read(new Uint8Array(1));
    expect(end.done).toBe(true);
  });

  test("settles a pending BYOB read at zero-byte EOF", async () => {
    const root = makeDir("media-byob-eof-");
    const path = join(root, "asset.bin");
    writeFileSync(path, Uint8Array.from([8, 9]));
    const reader = rawFileBody(path).getReader({ mode: "byob" });

    const body = await reader.read(new Uint8Array(4));
    expect(Array.from(body.value ?? [])).toEqual([8, 9]);

    const end = await reader.read(new Uint8Array(4));
    expect(end.done).toBe(true);
    expect(end.value?.byteLength).toBe(0);
  });

  test("produces at most one bounded chunk per pull and supports cancellation", async () => {
    const root = makeDir("media-bounded-body-");
    const path = join(root, "large.bin");
    writeFileSync(path, Buffer.alloc(2 * 1024 * 1024, 3));

    const reader = rawFileBody(path).getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(first.value?.byteLength).toBe(64 * 1024);
    await reader.cancel("test disconnect");
  });

  test("an already-aborted request closes before opening the file", async () => {
    const root = makeDir("media-pre-abort-");
    const path = join(root, "asset.bin");
    writeFileSync(path, "unused");
    const requestAbort = new AbortController();
    requestAbort.abort(new DOMException("request ended", "AbortError"));

    const response = new Response(
      rawFileBody(path, undefined, requestAbort.signal),
    );

    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  test("request abort stops a partially consumed body", async () => {
    const root = makeDir("media-mid-abort-");
    const path = join(root, "large.bin");
    writeFileSync(path, Buffer.alloc(2 * 1024 * 1024, 3));
    const requestAbort = new AbortController();
    const reader = rawFileBody(
      path,
      undefined,
      requestAbort.signal,
    ).getReader();

    const first = await reader.read();
    expect(first.done).toBe(false);
    requestAbort.abort(new DOMException("request ended", "AbortError"));

    expect(await reader.read()).toEqual({ done: true, value: undefined });
  });

  test("a real HTTP disconnect closes the source before EOF", async () => {
    const root = makeDir("media-http-disconnect-");
    const path = join(root, "large.bin");
    const fileSize = 32 * 1024 * 1024;
    writeFileSync(path, Buffer.alloc(fileSize, 3));

    type InstrumentedFileHandle = {
      read: (
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number,
      ) => Promise<{ bytesRead: number; buffer: Uint8Array }>;
      close: () => Promise<void>;
    };

    const probe = await open(path, "r");
    const prototype = Object.getPrototypeOf(probe) as InstrumentedFileHandle;
    await probe.close();
    const originalRead = prototype.read;
    const originalClose = prototype.close;
    let source: InstrumentedFileHandle | undefined;
    let bytesRead = 0;
    let sourceClosed = false;
    let requestAborted = false;

    prototype.read = async function (buffer, offset, length, position) {
      const result = await originalRead.call(
        this,
        buffer,
        offset,
        length,
        position,
      );
      source ??= this;
      if (source === this) bytesRead += result.bytesRead;
      return result;
    };
    prototype.close = async function () {
      if (source === this) sourceClosed = true;
      return originalClose.call(this);
    };

    let server: ReturnType<typeof Bun.serve> | undefined;
    try {
      const activeServer = Bun.serve({
        hostname: "127.0.0.1",
        port: await availablePort(),
        fetch: (request) => {
          request.signal.addEventListener(
            "abort",
            () => {
              requestAborted = true;
            },
            { once: true },
          );
          return new Response(rawFileBody(path, undefined, request.signal), {
            headers: { "Content-Length": String(fileSize) },
          });
        },
      });
      server = activeServer;
      const serverPort = activeServer.port;
      if (!serverPort) throw new Error("test server did not bind a port");

      await new Promise<void>((resolve, reject) => {
        let received = Buffer.alloc(0);
        const socket = createConnection(
          { host: "127.0.0.1", port: serverPort },
          () => {
            socket.write(
              "GET /asset HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
            );
          },
        );
        socket.once("error", reject);
        socket.on("data", (chunk) => {
          received = Buffer.concat([received, chunk]);
          const bodyStart = received.indexOf("\r\n\r\n");
          if (bodyStart !== -1 && received.length > bodyStart + 4) {
            socket.destroy();
          }
        });
        socket.once("close", () => resolve());
      });

      await waitFor(() => sourceClosed);
      expect(requestAborted).toBe(true);
      expect(bytesRead).toBeLessThan(fileSize);
    } finally {
      prototype.read = originalRead;
      prototype.close = originalClose;
      server?.stop(true);
    }
  });

  test("forwards an asynchronous open error to the response consumer", async () => {
    const root = makeDir("media-open-error-");
    const response = new Response(rawFileBody(join(root, "missing.epub")));

    await expect(response.arrayBuffer()).rejects.toThrow();
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 2000;
  while (!predicate()) {
    if (performance.now() >= deadline) {
      throw new Error("timed out waiting for file handle cleanup");
    }
    await Bun.sleep(10);
  }
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to allocate a test port");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

describe("BOOK_ID_RE", () => {
  test("accepts only 12 lowercase hex chars", () => {
    expect(BOOK_ID_RE.test("790133709c8f")).toBe(true);
    expect(BOOK_ID_RE.test("790133709C8F")).toBe(false);
    expect(BOOK_ID_RE.test("../etc/passwd")).toBe(false);
    expect(BOOK_ID_RE.test("790133709c8f0")).toBe(false);
    expect(BOOK_ID_RE.test("")).toBe(false);
  });
});
