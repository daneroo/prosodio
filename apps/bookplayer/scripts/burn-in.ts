import { execFile } from "node:child_process";
import { parseArgs, promisify } from "node:util";

import { chromium } from "playwright";
import type { Browser, Page, Request as PlaywrightRequest } from "playwright";

type NavigationMode = "hard" | "in-app";
type Endpoint = "epub" | "audio" | "vtt" | "alignment";
type EndpointSelection = Endpoint | "all";

type BurnInOptions = {
  serverUrl: string;
  playTimeMs: number;
  silentTimeMs: number;
  seekMiddle: boolean;
  numBooks: number;
  randomizeOrder: boolean;
  seed: number;
  books: Array<string>;
  navigation: NavigationMode;
  endpoint: EndpointSelection;
  serverPid: number | null;
  memoryUrl: string | null;
  headless: boolean;
  mute: boolean;
};

type RequestRecord = {
  iteration: number;
  endpoint: Endpoint | "other";
  method: string;
  url: string;
  status?: number;
  headers?: Record<string, string>;
  responseBodyBytes?: number;
  failure?: string;
  finished: boolean;
};

type MemorySample = {
  iteration: number;
  phase: "baseline" | "after-book";
  timestamp: string;
  rssBytes?: number;
  heapUsedBytes?: number;
  heapTotalBytes?: number;
};

const execFileAsync = promisify(execFile);

const DEFAULT_ARGS: BurnInOptions = {
  serverUrl: "http://localhost:3000/",
  playTimeMs: 0,
  silentTimeMs: 1000,
  seekMiddle: true,
  numBooks: 100,
  randomizeOrder: true,
  seed: 1,
  books: [],
  navigation: "hard",
  endpoint: "all",
  serverPid: null,
  memoryUrl: null,
  headless: false,
  mute: true,
};

if (import.meta.main) {
  await main();
}

async function main() {
  const options = parseArguments();
  let browser: Browser | null = null;

  console.log(
    JSON.stringify({
      type: "configuration",
      ...options,
      books: options.books.length > 0 ? options.books : undefined,
    }),
  );

  try {
    await ensureServerRunning(options.serverUrl);
    browser = await chromium.launch({ headless: options.headless });
    const page = await browser.newPage();
    const telemetry = await attachTelemetry(page, options.endpoint);

    const links =
      options.books.length > 0
        ? normalizeBookList(options.books, options.serverUrl).slice(
            0,
            options.numBooks,
          )
        : await gatherBookLinks(page, options);

    console.log(
      JSON.stringify({
        type: "selection",
        seed: options.seed,
        randomized: options.books.length === 0 && options.randomizeOrder,
        links,
      }),
    );

    await sampleMemory(options, 0, "baseline");

    for (let i = 0; i < links.length; i++) {
      const iteration = i + 1;
      telemetry.setIteration(iteration);
      await burnInBook(page, links[i] as string, options);
      await returnToLibrary(page, options);
      await page.waitForTimeout(50);
      await telemetry.flush();
      telemetry.reportIteration(iteration);
      await sampleMemory(options, iteration, "after-book");
    }

    await telemetry.flush();
    telemetry.reportFinal();
    console.log(JSON.stringify({ type: "complete", books: links.length }));
  } finally {
    await browser?.close();
  }
}

function parseArguments(): BurnInOptions {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      url: { type: "string" },
      "play-time": { type: "string" },
      "silent-time": { type: "string" },
      "no-seek": { type: "boolean" },
      "num-books": { type: "string" },
      "no-randomize": { type: "boolean" },
      seed: { type: "string" },
      books: { type: "string" },
      navigation: { type: "string" },
      endpoint: { type: "string" },
      "server-pid": { type: "string" },
      "memory-url": { type: "string" },
      headless: { type: "boolean" },
      "no-mute": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`
bookplayer burn-in

Options:
  --url URL             Server URL (default: ${DEFAULT_ARGS.serverUrl})
  --play-time MS        Time to play each book; 0 uses silent mode (default: ${DEFAULT_ARGS.playTimeMs})
  --silent-time MS      Settle time in silent mode (default: ${DEFAULT_ARGS.silentTimeMs})
  --no-seek             Do not seek to the middle before playing
  --num-books N         Maximum books to visit (default: ${DEFAULT_ARGS.numBooks})
  --seed N              Deterministic shuffle seed (default: ${DEFAULT_ARGS.seed})
  --no-randomize        Keep discovered library order (explicit lists stay exact)
  --books LIST          Comma-separated book IDs, /player paths, or absolute URLs
  --navigation MODE     hard or in-app (default: ${DEFAULT_ARGS.navigation})
  --endpoint ENDPOINT   all, epub, audio, vtt, or alignment (default: ${DEFAULT_ARGS.endpoint})
                        A selection aborts the other three raw-asset endpoint groups.
                        vtt covers raw VTT; parsed transcript server-function traffic
                        remains visible as "other" because its URL is framework-opaque.
  --server-pid PID      Sample server RSS with ps after each iteration
  --memory-url URL      GET a diagnostic JSON object after each iteration. Supported
                        fields: rss/rssBytes, heapUsed/heapUsedBytes,
                        heapTotal/heapTotalBytes, optionally nested under memory.
  --headless            Run Chromium headless
  --no-mute             Do not mute audio during playback
  --help, -h            Show this help

Telemetry is emitted as JSON lines. Request byte counts come from Playwright's
responseBodySize and do not require buffering response bodies in this process.
`);
    process.exit(0);
  }

  const serverUrl = normalizeHttpUrl(
    values.url ?? DEFAULT_ARGS.serverUrl,
    "url",
  );
  const navigation = parseChoice(
    values.navigation ?? DEFAULT_ARGS.navigation,
    ["hard", "in-app"] as const,
    "navigation",
  );
  const endpoint = parseChoice(
    values.endpoint ?? DEFAULT_ARGS.endpoint,
    ["all", "epub", "audio", "vtt", "alignment"] as const,
    "endpoint",
  );

  return {
    serverUrl,
    playTimeMs: parseInteger(
      values["play-time"],
      DEFAULT_ARGS.playTimeMs,
      "play-time",
      0,
    ),
    silentTimeMs: parseInteger(
      values["silent-time"],
      DEFAULT_ARGS.silentTimeMs,
      "silent-time",
      0,
    ),
    seekMiddle: !values["no-seek"],
    numBooks: parseInteger(
      values["num-books"],
      DEFAULT_ARGS.numBooks,
      "num-books",
      1,
    ),
    randomizeOrder: !values["no-randomize"],
    seed: parseInteger(values.seed, DEFAULT_ARGS.seed, "seed", 0),
    books: values.books
      ? values.books
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [],
    navigation,
    endpoint,
    serverPid: values["server-pid"]
      ? parseInteger(values["server-pid"], 0, "server-pid", 1)
      : null,
    memoryUrl: values["memory-url"]
      ? normalizeHttpUrl(values["memory-url"], "memory-url")
      : null,
    headless: values.headless ?? DEFAULT_ARGS.headless,
    mute: !values["no-mute"],
  };
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new Error(`--${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`--${name} must be at least ${minimum}`);
  }
  return parsed;
}

function parseChoice<const T extends readonly string[]>(
  value: string,
  choices: T,
  name: string,
): T[number] {
  if (!choices.includes(value)) {
    throw new Error(`--${name} must be one of: ${choices.join(", ")}`);
  }
  return value;
}

function normalizeHttpUrl(value: string, name: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`--${name} must use http or https`);
  }
  return url.href;
}

async function ensureServerRunning(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Server is not reachable at ${url}`, { cause: error });
  }
}

async function gatherBookLinks(page: Page, options: BurnInOptions) {
  await page.goto(options.serverUrl);
  let links: Array<string> = [];

  for (;;) {
    await waitForLibrary(page);
    links.push(
      ...(await page.$$eval('a[href^="/player/"]', (anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
      )),
    );

    const next = page.getByRole("button", { name: "Next", exact: true });
    if ((await next.count()) === 0 || (await next.isDisabled())) break;
    await next.click();
    await page.waitForTimeout(100);
  }

  links = [...new Set(links)];
  if (options.randomizeOrder) shuffle(links, options.seed);
  return links.slice(0, Math.min(options.numBooks, links.length));
}

function normalizeBookList(books: Array<string>, serverUrl: string) {
  return [...new Set(books.map((book) => normalizeBookUrl(book, serverUrl)))];
}

function normalizeBookUrl(book: string, serverUrl: string) {
  if (book.startsWith("http://") || book.startsWith("https://")) {
    return new URL(book).href;
  }
  const path = book.startsWith("/player/")
    ? book
    : `/player/${encodeURIComponent(book)}`;
  return new URL(path, serverUrl).href;
}

function shuffle(values: Array<string>, seed: number) {
  const random = seededRandom(seed);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j] as string, values[i] as string];
  }
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

async function burnInBook(page: Page, url: string, options: BurnInOptions) {
  console.log(JSON.stringify({ type: "book", url }));
  if (options.navigation === "hard") {
    await page.goto(url);
  } else {
    await navigateInApp(page, url, options.serverUrl);
  }

  const audio = await page
    .waitForSelector("audio", { state: "attached", timeout: 5000 })
    .catch(() => null);

  if (options.endpoint === "vtt") {
    const bookId = new URL(url).pathname.split("/").at(-1);
    if (bookId) {
      const assetUrl = new URL(`/api/vtt/${bookId}`, options.serverUrl).href;
      const result = await page.evaluate(async (requestUrl) => {
        const response = await fetch(requestUrl);
        if (!response.ok)
          throw new Error(`Raw VTT returned ${response.status}`);
        const reader = response.body?.getReader();
        let bytes = 0;
        while (reader) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
        }
        return { bytes, status: response.status };
      }, assetUrl);
      console.log(
        JSON.stringify({ type: "raw-vtt", url: assetUrl, ...result }),
      );
    }
  }

  if (options.playTimeMs > 0 && audio) {
    await audio.evaluate(
      (node, evaluateOptions) => {
        node.muted = evaluateOptions.mute;
        if (evaluateOptions.seekMiddle) {
          const seek = () => {
            if (Number.isFinite(node.duration) && node.duration > 0) {
              node.currentTime = node.duration / 2;
            }
          };
          if (Number.isFinite(node.duration)) seek();
          else node.addEventListener("loadedmetadata", seek, { once: true });
        }
        void node.play().catch(() => undefined);
      },
      { seekMiddle: options.seekMiddle, mute: options.mute },
    );
    await page.waitForTimeout(options.playTimeMs);
  } else {
    await page.waitForTimeout(options.silentTimeMs);
  }
}

async function navigateInApp(page: Page, targetUrl: string, serverUrl: string) {
  if (new URL(page.url()).pathname !== "/") {
    const back = page.getByRole("link", { name: "Back to library" });
    if ((await back.count()) === 0) await page.goto(serverUrl);
    else await back.click();
  }
  await waitForLibrary(page);

  for (;;) {
    const previous = page.getByRole("button", { name: "Prev", exact: true });
    if ((await previous.count()) === 0 || (await previous.isDisabled())) break;
    await previous.click();
    await page.waitForTimeout(100);
  }

  const targetPath = new URL(targetUrl).pathname;
  for (;;) {
    const link = page.locator(`a[href="${targetPath}"]`);
    if ((await link.count()) > 0) {
      await link.first().click();
      return;
    }

    const next = page.getByRole("button", { name: "Next", exact: true });
    if ((await next.count()) === 0 || (await next.isDisabled())) {
      throw new Error(`Book link is not present in the library: ${targetUrl}`);
    }
    await next.click();
    await page.waitForTimeout(100);
  }
}

async function returnToLibrary(page: Page, options: BurnInOptions) {
  if (options.navigation === "hard") {
    await page.goto(options.serverUrl);
  } else {
    await page.getByRole("link", { name: "Back to library" }).click();
  }
  await waitForLibrary(page);
}

async function waitForLibrary(page: Page) {
  await page.waitForSelector('a[href^="/player/"]', { timeout: 10_000 });
}

async function attachTelemetry(page: Page, selection: EndpointSelection) {
  const records = new Map<PlaywrightRequest, RequestRecord>();
  const pending = new Set<Promise<void>>();
  let iteration = 0;

  await page.route("**/*", async (route) => {
    const endpoint = classifyEndpoint(route.request().url());
    if (selection !== "all" && endpoint !== "other" && endpoint !== selection) {
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });

  page.on("request", (request) => {
    records.set(request, {
      iteration,
      endpoint: classifyEndpoint(request.url()),
      method: request.method(),
      url: request.url(),
      finished: false,
    });
  });

  page.on("response", (response) => {
    track(
      pending,
      (async () => {
        const record = records.get(response.request());
        if (!record) return;
        record.status = response.status();
        record.headers = selectHeaders(await response.allHeaders());
      })(),
    );
  });

  page.on("requestfinished", (request) => {
    track(
      pending,
      (async () => {
        const record = records.get(request);
        if (!record) return;
        record.finished = true;
        try {
          record.responseBodyBytes = (await request.sizes()).responseBodySize;
        } catch {
          // Some aborted or cached requests have no transfer-size record.
        }
      })(),
    );
  });

  page.on("requestfailed", (request) => {
    const record = records.get(request);
    if (!record) return;
    record.finished = true;
    record.failure = request.failure()?.errorText ?? "unknown request failure";
    console.log(JSON.stringify({ type: "request-failure", ...record }));
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      console.log(
        JSON.stringify({
          type: "browser-console-error",
          iteration,
          text: message.text(),
        }),
      );
    }
  });

  page.on("pageerror", (error) => {
    console.log(
      JSON.stringify({
        type: "browser-page-error",
        iteration,
        text: error.message,
      }),
    );
  });

  return {
    setIteration(value: number) {
      iteration = value;
    },
    async flush() {
      await Promise.allSettled([...pending]);
    },
    reportIteration(value: number) {
      const current = [...records.values()].filter(
        (record) => record.iteration === value && record.endpoint !== "other",
      );
      console.log(
        JSON.stringify({
          type: "request-summary",
          iteration: value,
          endpoints: summarizeRequests(current),
        }),
      );
    },
    reportFinal() {
      const relevant = [...records.values()].filter(
        (record) => record.endpoint !== "other" || record.failure,
      );
      for (const record of relevant) {
        console.log(JSON.stringify({ type: "request", ...record }));
      }
    },
  };
}

function track(pending: Set<Promise<void>>, promise: Promise<void>) {
  pending.add(promise);
  void promise.then(
    () => pending.delete(promise),
    (error: unknown) => {
      pending.delete(promise);
      console.log(
        JSON.stringify({
          type: "telemetry-error",
          text: error instanceof Error ? error.message : String(error),
        }),
      );
    },
  );
}

function classifyEndpoint(urlValue: string): Endpoint | "other" {
  const pathname = new URL(urlValue).pathname;
  if (pathname.startsWith("/api/epub/")) return "epub";
  if (pathname.startsWith("/api/audio/")) return "audio";
  if (pathname.startsWith("/api/vtt/")) return "vtt";
  if (pathname.startsWith("/api/alignment/")) return "alignment";
  return "other";
}

function selectHeaders(headers: Record<string, string>) {
  const selected: Record<string, string> = {};
  for (const name of [
    "content-length",
    "content-range",
    "content-type",
    "content-encoding",
    "transfer-encoding",
    "etag",
    "connection",
  ]) {
    if (headers[name] !== undefined) selected[name] = headers[name];
  }
  return selected;
}

function summarizeRequests(records: Array<RequestRecord>) {
  const summary: Record<
    string,
    { started: number; finished: number; failed: number; bytes: number }
  > = {};
  for (const record of records) {
    const endpoint = (summary[record.endpoint] ??= {
      started: 0,
      finished: 0,
      failed: 0,
      bytes: 0,
    });
    endpoint.started++;
    if (record.finished) endpoint.finished++;
    if (record.failure) endpoint.failed++;
    endpoint.bytes += record.responseBodyBytes ?? 0;
  }
  return summary;
}

async function sampleMemory(
  options: BurnInOptions,
  iteration: number,
  phase: MemorySample["phase"],
) {
  if (options.serverPid === null && options.memoryUrl === null) return;

  const sample: MemorySample = {
    iteration,
    phase,
    timestamp: new Date().toISOString(),
  };

  if (options.serverPid !== null) {
    const { stdout } = await execFileAsync("ps", [
      "-o",
      "rss=",
      "-p",
      String(options.serverPid),
    ]);
    const rssKiB = Number(stdout.trim());
    if (!Number.isFinite(rssKiB)) {
      throw new Error(`Could not read RSS for server PID ${options.serverPid}`);
    }
    sample.rssBytes = rssKiB * 1024;
  }

  if (options.memoryUrl !== null) {
    const response = await fetch(options.memoryUrl);
    if (!response.ok) {
      throw new Error(`Memory diagnostic returned HTTP ${response.status}`);
    }
    const body = (await response.json()) as Record<string, unknown>;
    const memory = isRecord(body.memory) ? body.memory : body;
    const rssBytes = readMemoryNumber(memory, "rssBytes", "rss");
    const heapUsedBytes = readMemoryNumber(memory, "heapUsedBytes", "heapUsed");
    const heapTotalBytes = readMemoryNumber(
      memory,
      "heapTotalBytes",
      "heapTotal",
    );
    if (
      rssBytes === undefined &&
      heapUsedBytes === undefined &&
      heapTotalBytes === undefined
    ) {
      throw new Error("Memory diagnostic JSON has no supported numeric fields");
    }
    sample.rssBytes = rssBytes ?? sample.rssBytes;
    sample.heapUsedBytes = heapUsedBytes;
    sample.heapTotalBytes = heapTotalBytes;
  }

  console.log(JSON.stringify({ type: "memory", ...sample }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMemoryNumber(
  memory: Record<string, unknown>,
  preferred: string,
  fallback: string,
) {
  const value = memory[preferred] ?? memory[fallback];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
