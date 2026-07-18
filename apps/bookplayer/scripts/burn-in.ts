import { parseArgs } from "node:util";

import { chromium } from "playwright";
import type { Browser, Page } from "playwright";

const DEFAULT_ARGS: BurnInOptions = {
  serverUrl: "http://localhost:3000/",
  playTimeMs: 10_000,
  silentTimeMs: 1_000,
  seekMiddle: true,
  numBooks: 100,
  randomizeOrder: true,
  seed: 0,
  books: [],
  repeat: 1,
  headless: false,
  mute: true,
};

if (import.meta.main) await main();

async function main() {
  const options = parseArguments();
  let browser: Browser | null = null;

  printConfiguration(options);

  try {
    await ensureServerRunning(options.serverUrl);
    browser = await chromium.launch({ headless: options.headless });
    const page = await browser.newPage();
    const errors = observeErrors(page);
    const selected =
      options.books.length > 0
        ? normalizeBookList(options.books, options.serverUrl).slice(
            0,
            options.numBooks,
          )
        : await gatherBookLinks(page, options);
    const links = repeatLinks(selected, options.repeat);

    console.log(
      `- Selected: ${links.length} books (${options.randomizeOrder ? `shuffled with seed ${options.seed}` : "fixed order"})`,
    );

    const memory = createMemorySummary();
    memory.add(await readRss(options.serverUrl));
    console.log(`- Baseline ${formatMemorySummary(memory.snapshot())}`);

    for (let index = 0; index < links.length; index++) {
      const iteration = index + 1;
      const url = links[index] as string;
      await visitBook(
        page,
        url,
        options,
        iteration,
        links.length,
        errors.report,
      );
      await page.goto(options.serverUrl);
      await waitForLibrary(page);

      memory.add(await readRss(options.serverUrl));
      console.log(`- Memory: ${formatMemorySummary(memory.snapshot())}`);
    }

    console.log("\n## Done\n");
    console.log(
      `- Completed ${links.length} books with ${errors.count()} errors.`,
    );
    console.log(`- Memory: ${formatMemorySummary(memory.snapshot())}`);
    if (errors.count() > 0) process.exitCode = 1;
  } finally {
    await browser?.close();
  }
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

async function visitBook(
  page: Page,
  url: string,
  options: BurnInOptions,
  iteration: number,
  total: number,
  reportError: (kind: string, text: string) => void,
) {
  console.log(`\n## Book ${iteration} of ${total}\n\n- URL: ${url}`);
  await page.goto(url);

  const audio = await page
    .waitForSelector("audio", { state: "attached", timeout: 5000 })
    .catch(() => null);

  if (!audio) {
    reportError("Media error", "audio element unavailable");
    await page.waitForTimeout(options.silentTimeMs);
    return;
  }

  if (options.playTimeMs === 0) {
    console.log(`- Silent settle for ${formatDuration(options.silentTimeMs)}`);
    await page.waitForTimeout(options.silentTimeMs);
  } else {
    console.log(
      `- Playing${options.seekMiddle ? " from the middle" : ""} for ${formatDuration(options.playTimeMs)}`,
    );
    await audio.evaluate(
      (node, playback) => {
        node.muted = playback.mute;
        const seek = () => {
          if (
            playback.seekMiddle &&
            Number.isFinite(node.duration) &&
            node.duration > 0
          ) {
            node.currentTime = node.duration / 2;
          }
        };
        if (Number.isFinite(node.duration)) seek();
        else node.addEventListener("loadedmetadata", seek, { once: true });
        void node.play().catch(() => undefined);
      },
      { mute: options.mute, seekMiddle: options.seekMiddle },
    );
    await page.waitForTimeout(options.playTimeMs);
  }

  const result = await page
    .locator("audio")
    .evaluate((element) => {
      const node = element as HTMLAudioElement;
      return {
        error: node.error
          ? `code ${node.error.code}: ${node.error.message || "no message"}`
          : null,
        readyState: node.readyState,
        networkState: node.networkState,
        durationSeconds: Number.isFinite(node.duration) ? node.duration : null,
        currentTimeSeconds: node.currentTime,
      };
    })
    .catch((error: unknown) => {
      reportError(
        "Media diagnostics unavailable",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    });

  if (!result) return;
  if (result.error) reportError("Media error", result.error);
  console.log(
    `- Media: ready ${result.readyState}, network ${result.networkState}, position ${formatSeconds(result.currentTimeSeconds)}${result.durationSeconds === null ? "" : ` of ${formatSeconds(result.durationSeconds)}`}`,
  );
}

function observeErrors(page: Page) {
  let count = 0;
  const report = (kind: string, text: string) => {
    if (isExpectedAbort(text)) return;
    count++;
    console.log(`- ${kind}: ${text}`);
  };

  page.on("requestfailed", (request) => {
    report(
      "Request failed",
      `${request.url()} — ${request.failure()?.errorText ?? "unknown failure"}`,
    );
  });
  page.on("console", (message) => {
    if (message.type() === "error") report("Browser error", message.text());
  });
  page.on("pageerror", (error) => report("Page error", error.message));

  return { count: () => count, report };
}

async function readRss(serverUrl: string) {
  const url = new URL("/api/dev/memory", serverUrl);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Memory route returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as { rssBytes?: unknown };
  if (typeof body.rssBytes !== "number" || !Number.isFinite(body.rssBytes)) {
    throw new Error("Memory route did not return a numeric rssBytes value");
  }
  return body.rssBytes;
}

function createMemorySummary() {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let final = 0;

  return {
    add(rssBytes: number) {
      min = Math.min(min, rssBytes);
      max = Math.max(max, rssBytes);
      final = rssBytes;
    },
    snapshot(): MemorySummary {
      return { min, max, range: max - min, final };
    },
  };
}

function formatMemorySummary(memory: MemorySummary) {
  return `RSS final ${formatBytes(memory.final)}; min ${formatBytes(memory.min)}; max ${formatBytes(memory.max)}; range ${formatBytes(memory.range)}`;
}

function printConfiguration(options: BurnInOptions) {
  const duration =
    options.playTimeMs === 0 ? options.silentTimeMs : options.playTimeMs;
  const mode = options.playTimeMs === 0 ? "silent" : "playback";
  console.log(
    `# bookplayer burn-in\n\n- Seed: ${options.seed} (rerun with --seed ${options.seed})\n- Server: ${options.serverUrl}\n- Mode: ${mode} (${formatDuration(duration)})`,
  );
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
  for (let index = values.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [values[index], values[target]] = [
      values[target] as string,
      values[index] as string,
    ];
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

async function waitForLibrary(page: Page) {
  await page.waitForSelector('a[href^="/player/"]', { timeout: 10_000 });
}

function isExpectedAbort(text: string) {
  return /ERR_ABORTED|NS_BINDING_ABORTED/i.test(text);
}

function formatDuration(durationMs: number) {
  return durationMs >= 1000
    ? `${(durationMs / 1000).toFixed(durationMs % 1000 === 0 ? 0 : 1)}s`
    : `${durationMs}ms`;
}

function formatSeconds(seconds: number) {
  return `${seconds.toFixed(1)}s`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
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
      repeat: { type: "string" },
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
  --seed N              Deterministic shuffle seed (default: random each run)
  --no-randomize        Keep discovered library order
  --books LIST          Comma-separated book IDs, /player paths, or absolute URLs
  --repeat N            Repeat the selected list (default: ${DEFAULT_ARGS.repeat})
  --headless            Run Chromium headless
  --no-mute             Do not mute audio during playback
  --help, -h            Show this help
`);
    process.exit(0);
  }

  return {
    serverUrl: normalizeHttpUrl(values.url ?? DEFAULT_ARGS.serverUrl),
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
    seed:
      values.seed === undefined
        ? Math.floor(Math.random() * 2 ** 32)
        : parseInteger(values.seed, DEFAULT_ARGS.seed, "seed", 0),
    books: values.books
      ? values.books
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [],
    repeat: parseRepeat(values.repeat),
    headless: values.headless ?? DEFAULT_ARGS.headless,
    mute: !values["no-mute"],
  };
}

function parseRepeat(value: string | undefined) {
  return parseInteger(value, DEFAULT_ARGS.repeat, "repeat", 1);
}

function repeatLinks<T>(links: ReadonlyArray<T>, repeat: number) {
  return Array.from({ length: repeat }, () => links).flat();
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`--${name} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`--${name} must be at least ${minimum}`);
  }
  return parsed;
}

function normalizeHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("--url must use http or https");
  }
  return url.href;
}

type BurnInOptions = {
  serverUrl: string;
  playTimeMs: number;
  silentTimeMs: number;
  seekMiddle: boolean;
  numBooks: number;
  randomizeOrder: boolean;
  seed: number;
  books: Array<string>;
  repeat: number;
  headless: boolean;
  mute: boolean;
};

type MemorySummary = {
  min: number;
  max: number;
  range: number;
  final: number;
};
