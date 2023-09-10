import { defineConfig, devices, PlaywrightTestConfig } from "@playwright/test";
import * as os from "os";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();
const headless = !!process.env.CI || !!process.env.PLAYWRIGHT_HEADLESS;

const webServer: PlaywrightTestConfig["webServer"] = [
  {
    command: "ENV=local pnpm run backend",
    port: 54321,
    timeout: 60_000,
    reuseExistingServer: true,
  },
];

webServer.push({
  command: "ENV=local pnpm run serve",
  port: 5173,
  timeout: 60_000,
  reuseExistingServer: true,
});

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.PWDEBUG ? 1 : os.cpus().length,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["list", { printSteps: true }],
    ["github"],
    ["html", { outputFolder: "./test-results/reports/playwright-html-report", open: "never" }],
  ],
  use: {
    trace: "on-first-retry",
    headless: headless,
  },
  webServer: webServer,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    }
  ],
});
