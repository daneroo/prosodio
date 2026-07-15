import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  ReadStream,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BOOK_ID_RE,
  parseRangeHeader,
  rawFileBody,
  safeResolve,
  serveBuffered,
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
    writeFileSync(path, Buffer.alloc(bytes, 7));
    return path;
  }

  test("full response has exact Content-Length and Accept-Ranges", async () => {
    const path = makeAudio(4096);
    const res = serveStreamedWithRange(path, rangeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("4096");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Server-Timing")).toContain("file;dur=");
    expect((await res.arrayBuffer()).byteLength).toBe(4096);
  });

  test("bounded range returns 206 with matching Content-Range and body", async () => {
    const path = makeAudio(4096);
    const res = serveStreamedWithRange(path, rangeRequest("bytes=0-1023"));
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-1023/4096");
    expect(res.headers.get("Content-Length")).toBe("1024");
    expect((await res.arrayBuffer()).byteLength).toBe(1024);
  });

  test("suffix range returns the tail", async () => {
    const path = makeAudio(4096);
    const res = serveStreamedWithRange(path, rangeRequest("bytes=-100"));
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 3996-4095/4096");
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  test("unsatisfiable range returns 416 with Content-Range */size", () => {
    const path = makeAudio(4096);
    const res = serveStreamedWithRange(path, rangeRequest("bytes=99999-"));
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */4096");
  });

  test("missing file returns structured 404", async () => {
    const root = makeDir("media-root-");
    const res = serveStreamedWithRange(join(root, "gone.m4b"), rangeRequest());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ASSET_MISSING");
  });
});

describe("serveBuffered", () => {
  test("Content-Length matches the payload byte for byte", async () => {
    const root = makeDir("media-root-");
    const path = join(root, "book.epub");
    writeFileSync(path, Buffer.alloc(2222, 3));
    const res = serveBuffered(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/epub+zip");
    expect(res.headers.get("Content-Length")).toBe("2222");
    expect((await res.arrayBuffer()).byteLength).toBe(2222);
  });

  test("cancelling the response body stops its file stream before EOF", async () => {
    const root = makeDir("media-cancel-");
    const path = join(root, "large.epub");
    const fileSize = 8 * 1024 * 1024;
    writeFileSync(path, Buffer.alloc(fileSize, 3));

    let bytesProduced = 0;
    let observedSource: ReadStream | undefined;
    const originalPush = ReadStream.prototype.push;

    ReadStream.prototype.push = function (chunk, encoding) {
      if (this.path === path) {
        observedSource = this;
        if (chunk !== null) bytesProduced += chunk.byteLength;
      }
      return originalPush.call(this, chunk, encoding);
    };

    try {
      const response = serveBuffered(path);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("response has no readable body");

      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(first.value?.byteLength).toBeGreaterThan(0);

      await reader.cancel("test stopped after the first chunk");

      const source = observedSource;
      if (!source) throw new Error("file stream did not produce a chunk");
      if (!source.closed) {
        await new Promise<void>((resolve) => source.once("close", resolve));
      }

      expect(source.destroyed).toBe(true);
      expect(source.readableEnded).toBe(false);
      expect(bytesProduced).toBeLessThan(fileSize);
    } finally {
      ReadStream.prototype.push = originalPush;
    }
  });
});

describe("rawFileBody", () => {
  test("forwards an asynchronous open error to the response consumer", async () => {
    const root = makeDir("media-open-error-");
    const response = new Response(rawFileBody(join(root, "missing.epub")));

    await expect(response.arrayBuffer()).rejects.toThrow();
  });
});

describe("BOOK_ID_RE", () => {
  test("accepts only 12 lowercase hex chars", () => {
    expect(BOOK_ID_RE.test("790133709c8f")).toBe(true);
    expect(BOOK_ID_RE.test("790133709C8F")).toBe(false);
    expect(BOOK_ID_RE.test("../etc/passwd")).toBe(false);
    expect(BOOK_ID_RE.test("790133709c8f0")).toBe(false);
    expect(BOOK_ID_RE.test("")).toBe(false);
  });
});
