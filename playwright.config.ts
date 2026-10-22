// Playwright end-to-end config (qa). Runs the production build in mock mode: YOUCAM_MODE is left off, so no
// YouCam call is ever made, and every key is blanked so the planner uses its rule-based fallback.
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3107);
const BASE = `http://127.0.0.1:${PORT}`;
const START = `npx next start -H 127.0.0.1 -p ${PORT}`;

export default defineConfig({
  testDir: "./test/e2e",
  // *.e2e.ts, not *.spec.ts: vitest (npm test) picks up every *.spec.ts and must not run these.
  testMatch: "**/*.e2e.ts",
  outputDir: "./test/e2e/.results",
  // MediaPipe runs in the browser on every card; allow for a slow CI runner.
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "test/e2e/.report", open: "never" }]]
    : [["list"]],
  use: { baseURL: BASE, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // E2E_SKIP_BUILD=1 reuses an existing .next build (CI builds in an earlier step).
    command: process.env.E2E_SKIP_BUILD ? START : `npm run build && ${START}`,
    url: `${BASE}/api/status`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      YOUCAM_MODE: "mock",
      YOUCAM_API_KEY: "",
      GOOGLE_GENERATIVE_AI_API_KEY: "",
      GROQ_API_KEY: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
      TESTER_CODE: "",
    },
  },
});
