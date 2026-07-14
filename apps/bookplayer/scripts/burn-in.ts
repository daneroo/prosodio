import { chromium } from "playwright";

const SERVER_URL = "http://localhost:3000/";
const PLAY_TIME_MS = 10_000;
const SILENT_TIME_MS = 1000;
const SEEK_MIDDLE = true;
const NUM_BOOKS = 100;
const RANDOMIZE_ORDER = true as boolean;

async function main() {
  console.log("\n# bookplayer Burn-in test\n");
  console.log(`- Checking if dev server is running at ${SERVER_URL}...`);

  try {
    const res = await fetch(SERVER_URL);
    if (!res.ok) throw new Error("Not OK");
  } catch {
    console.error(
      `\n✘ Dev server is not running! Please start it with \`bun run dev\` first so it is available at ${SERVER_URL}`,
    );
    process.exit(1);
  }

  console.log("- Launching visible browser for burn-in test...");
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log(`- Navigating to home page (${SERVER_URL})...`);
  await page.goto(SERVER_URL);

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
      // Brief pause to let React render the next page
      await page.waitForTimeout(100);
    }
  }

  // Deduplicate and filter out non-string falsy values
  links = [...new Set(links)];

  const totalFound = links.length;

  if (RANDOMIZE_ORDER) {
    // Basic Fisher-Yates shuffle
    for (let i = links.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [links[i], links[j]] = [links[j] as string, links[i] as string];
    }
  }

  links = links.slice(0, Math.min(NUM_BOOKS, links.length));

  console.log(
    `- Found ${totalFound} books - selected ${links.length}. (randomized: ${RANDOMIZE_ORDER})`,
  );
  console.log("- Starting the burn-in\n");

  for (let i = 0; i < links.length; i++) {
    console.log(`## Book ${i + 1} of ${links.length}\n`);
    console.log(`- Opening ${links[i]}`);
    await page.goto(links[i] as string);

    console.log("- Waiting for player to render...");
    const startWait = performance.now();
    // `<audio>` has no `controls`, so it's invisible. We must wait for it to be 'attached', not 'visible'
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

    if (PLAY_TIME_MS > 0 && audioEl) {
      console.log(
        SEEK_MIDDLE
          ? "- Playing audio from the middle..."
          : "- Playing audio...",
      );
      await audioEl.evaluate((node, shouldSeek) => {
        const audio = node as HTMLAudioElement;
        audio.muted = true; // Prevent blasting audio during burn-in

        const tryPlay = () => audio.play().catch(() => {});

        if (shouldSeek) {
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
      }, SEEK_MIDDLE);

      console.log(`- Waiting ${PLAY_TIME_MS / 1000} seconds...`);
      await page.waitForTimeout(PLAY_TIME_MS);
    } else {
      console.log(
        `- Silent mode: waiting ${SILENT_TIME_MS / 1000}s for requests to fire...`,
      );
      await page.waitForTimeout(SILENT_TIME_MS);
    }

    console.log("- Going back to library...\n");
    await page.goto(SERVER_URL);
    await page.waitForSelector('a[href^="/player/"]', { timeout: 10000 });
  }

  console.log("## Done\n");
  console.log(
    "- Burn-in completed successfully! If the dev server didn't crash, the OOM is fixed.",
  );
  await browser.close();
}

main().catch(console.error);
