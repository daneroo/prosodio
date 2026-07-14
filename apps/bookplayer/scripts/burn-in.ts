import { chromium } from "playwright";
import type { Page } from "playwright";
import { parseArgs } from "node:util";

type BurnInOptions = {
  serverUrl: string;
  playTimeMs: number;
  silentTimeMs: number;
  seekMiddle: boolean;
  numBooks: number;
  randomizeOrder: boolean;
  headless: boolean;
  mute: boolean;
};

const DEFAULT_ARGS: BurnInOptions = {
  serverUrl: "http://localhost:3000/",
  playTimeMs: 0,
  silentTimeMs: 1000,
  seekMiddle: true,
  numBooks: 100,
  randomizeOrder: true,
  headless: false,
  mute: true,
};

// ENTRY POINT
if (import.meta.main) {
  await main();
}

async function main() {
  const options = parseArguments();

  console.log("\n# bookplayer Burn-in test\n");
  await ensureServerRunning(options.serverUrl);

  console.log("- Launching browser for burn-in test...");
  const browser = await chromium.launch({ headless: options.headless });
  const page = await browser.newPage();

  const links = await gatherBookLinks(
    page,
    options.serverUrl,
    options.numBooks,
    options.randomizeOrder,
  );

  console.log(
    `- Selected ${links.length} books. (randomized: ${options.randomizeOrder})`,
  );
  console.log("- Starting the burn-in\n");

  for (let i = 0; i < links.length; i++) {
    console.log(`## Book ${i + 1} of ${links.length}\n`);
    await burnInBook(page, links[i] as string, options);

    console.log("- Going back to library...\n");
    await page.goto(options.serverUrl);
    await page.waitForSelector('a[href^="/player/"]', { timeout: 10000 });
  }

  console.log("## Done\n");
  console.log(
    "- Burn-in completed successfully! If the dev server didn't crash, the OOM is fixed.",
  );
  await browser.close();
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
      headless: { type: "boolean" },
      "no-mute": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`
bookplayer Burn-in test

Options:
  --url            Dev server URL (default: ${DEFAULT_ARGS.serverUrl})
  --play-time      Time to play each book in ms. 0 means silent fast-mode. (default: ${DEFAULT_ARGS.playTimeMs})
  --silent-time    Time to wait when play-time is 0. (default: ${DEFAULT_ARGS.silentTimeMs})
  --no-seek        Disable seeking to the middle of the book when playing. (default: ${!DEFAULT_ARGS.seekMiddle})
  --num-books      Maximum number of books to test. (default: ${DEFAULT_ARGS.numBooks})
  --no-randomize   Process books sequentially instead of randomizing order. (default: ${!DEFAULT_ARGS.randomizeOrder})
  --headless       Run browser in headless mode. (default: ${DEFAULT_ARGS.headless})
  --no-mute        Disable muting the audio player during burn-in. (default: ${!DEFAULT_ARGS.mute})
  --help, -h       Show this help message.
`);
    process.exit(0);
  }

  return {
    serverUrl: values.url ?? DEFAULT_ARGS.serverUrl,
    playTimeMs: values["play-time"]
      ? parseInt(values["play-time"], 10)
      : DEFAULT_ARGS.playTimeMs,
    silentTimeMs: values["silent-time"]
      ? parseInt(values["silent-time"], 10)
      : DEFAULT_ARGS.silentTimeMs,
    seekMiddle: values["no-seek"] ? false : DEFAULT_ARGS.seekMiddle,
    numBooks: values["num-books"]
      ? parseInt(values["num-books"], 10)
      : DEFAULT_ARGS.numBooks,
    randomizeOrder: values["no-randomize"]
      ? false
      : DEFAULT_ARGS.randomizeOrder,
    headless: values.headless ?? DEFAULT_ARGS.headless,
    mute: values["no-mute"] ? false : DEFAULT_ARGS.mute,
  };
}

async function ensureServerRunning(url: string) {
  console.log(`- Checking if dev server is running at ${url}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Not OK");
  } catch {
    console.error(
      `\n✘ Dev server is not running! Please start it with \`bun run dev\` first so it is available at ${url}`,
    );
    process.exit(1);
  }
}

async function gatherBookLinks(
  page: Page,
  url: string,
  limit: number,
  randomize: boolean,
) {
  console.log(`- Navigating to home page (${url})...`);
  await page.goto(url);

  let links: string[] = [];
  let hasNext = true;

  while (hasNext) {
    await page.waitForSelector('a[href^="/player/"]', { timeout: 10000 });
    const pageLinks = await page.$$eval("a", (as) =>
      as.map((a) => a.href).filter((h) => h.includes("/player/")),
    );
    links.push(...pageLinks);

    const nextBtn = await page.$('button:has-text("Next")');
    if (!nextBtn || (await nextBtn.isDisabled())) {
      hasNext = false;
    } else {
      await nextBtn.click();
      await page.waitForTimeout(100);
    }
  }

  links = [...new Set(links)];

  if (randomize) {
    for (let i = links.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [links[i], links[j]] = [links[j] as string, links[i] as string];
    }
  }

  return links.slice(0, Math.min(limit, links.length));
}

async function burnInBook(page: Page, url: string, options: BurnInOptions) {
  console.log(`- Opening ${url}`);
  await page.goto(url);

  console.log("- Waiting for player to render...");
  const startWait = performance.now();
  const audioEl = await page
    .waitForSelector("audio", { state: "attached", timeout: 5000 })
    .catch(() => null);

  if (audioEl) {
    console.log(
      `  ✓ Player rendered in ${Math.round(performance.now() - startWait)}ms`,
    );
  } else {
    console.log("  ⚠ Audio player did not render within 5 seconds.");
  }

  if (options.playTimeMs > 0 && audioEl) {
    console.log(
      options.seekMiddle
        ? "- Playing audio from the middle..."
        : "- Playing audio...",
    );

    await audioEl.evaluate(
      (node, evaluateOptions) => {
        const audio = node;
        if (evaluateOptions.mute) {
          audio.muted = true; // Prevent blasting audio during burn-in
        } else {
          audio.muted = false;
        }

        const tryPlay = () => audio.play().catch(() => {});

        if (evaluateOptions.seekMiddle) {
          const seekToMiddle = () => {
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
              audio.currentTime = audio.duration / 2;
            }
          };

          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            seekToMiddle();
          } else {
            audio.addEventListener("loadedmetadata", seekToMiddle, {
              once: true,
            });
          }
        }

        tryPlay();
      },
      { seekMiddle: options.seekMiddle, mute: options.mute },
    );

    console.log(`- Waiting ${options.playTimeMs / 1000} seconds...`);
    await page.waitForTimeout(options.playTimeMs);
  } else {
    console.log(
      `- Silent mode: waiting ${options.silentTimeMs / 1000}s for requests to fire...`,
    );
    await page.waitForTimeout(options.silentTimeMs);
  }
}
