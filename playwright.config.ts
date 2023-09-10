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
    command: "pnpm run backend",
    port: 54321,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
];

webServer.push({
  command: "pnpm run serve",
  port: 3100,
  timeout: 60_000,
  reuseExistingServer: !process.env.CI,
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
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    headless: headless,
  },
  webServer: webServer,
  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
