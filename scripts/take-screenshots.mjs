import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "@playwright/test";

const PORT = 3109;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(process.cwd(), "docs", "screenshots", "ui-polish");

async function waitReady(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function main() {
  console.log("Starting server on port", PORT);
  const server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    env: { ...process.env, YOUCAM_MODE: "mock" },
    shell: true,
    stdio: "inherit",
  });

  try {
    await waitReady(`${BASE}/api/status`);
    console.log("Server ready, launching browser...");

    const browser = await chromium.launch();

    // 1. Landing at multiple viewports: 360, 390, 768, 1280
    for (const width of [360, 390, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(`${BASE}/`);
      await page.waitForSelector("h1");
      await page.screenshot({ path: path.join(OUT, `landing-${width}px.png`), fullPage: true });
      await page.close();
      console.log(`Saved landing-${width}px.png`);
    }

    // 2. Results carousel at multiple viewports: 360, 390, 768, 1280
    for (const width of [360, 390, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      // Direct navigate with person=P1&stage=gone (sample person link supported by app)
      await page.goto(`${BASE}/results?person=P1&stage=gone`);
      await page.waitForSelector("article");
      // Wait for at least the first 2 card images to paint
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT, `results-${width}px.png`), fullPage: true });
      await page.close();
      console.log(`Saved results-${width}px.png`);
    }

    // 3. Other key screens at standard mobile width (390px)
    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });

    // Consent
    await mobilePage.goto(`${BASE}/start`);
    await mobilePage.waitForSelector("h1");
    await mobilePage.screenshot({ path: path.join(OUT, `consent-390px.png`), fullPage: true });
    console.log("Saved consent-390px.png");

    // Capture (samples)
    await mobilePage.goto(`${BASE}/capture`);
    await mobilePage.waitForSelector("h1");
    await mobilePage.screenshot({ path: path.join(OUT, `capture-390px.png`), fullPage: true });
    console.log("Saved capture-390px.png");

    // Stage
    // Navigate properly from start to stage with sample 1
    await mobilePage.goto(`${BASE}/start`);
    await mobilePage.click("text=I agree, continue to my photo");
    await mobilePage.click("button:has-text('Sample person 1')");
    await mobilePage.waitForSelector("h1:has-text('Has your hair loss started?')");
    await mobilePage.screenshot({ path: path.join(OUT, `stage-390px.png`), fullPage: true });
    console.log("Saved stage-390px.png");

    // Plan
    await mobilePage.goto(`${BASE}/results?person=P1&stage=gone`);
    await mobilePage.waitForSelector("text=Plan around the treatment dates");
    await mobilePage.click("text=Plan around the treatment dates");
    await mobilePage.waitForSelector("h1:has-text('Plan around the treatment dates')");
    await mobilePage.screenshot({ path: path.join(OUT, `plan-390px.png`), fullPage: true });
    console.log("Saved plan-390px.png");

    // How we tested
    await mobilePage.goto(`${BASE}/how-we-tested`);
    await mobilePage.waitForSelector("h1:has-text('How we tested this')");
    await mobilePage.screenshot({ path: path.join(OUT, `how-we-tested-390px.png`), fullPage: true });
    console.log("Saved how-we-tested-390px.png");

    await mobilePage.close();
    await browser.close();
    console.log("All screenshots taken successfully!");
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
