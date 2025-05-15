import type { PlaywrightTestConfig } from '@playwright/test'
import * as os from 'node:os'
import { env } from 'node:process'
import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
const headless = !!env.CI || !!env.PLAYWRIGHT_HEADLESS

const webServer: PlaywrightTestConfig['webServer'] = []

if (!env.SKIP_BACKEND_START) {
  webServer.push({
    command: 'ENV=local bun run backend',
    port: 54321,
    timeout: 60_000,
    reuseExistingServer: true,
  })
}
else {
  console.log('Skipping backend server')
}

webServer.push({
  command: 'bun run serve:dev',
  port: 5173,
  timeout: 60_000,
  reuseExistingServer: true,
  stdout: 'pipe',
})

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './playwright/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!env.CI,
  /* Never retry, the entire thing is stateful and retries will never succed becouse of the modifications to supabase in the previous attempt */
  retries: 0,
  /* Opt out of parallel tests on CI. */
  workers: os.cpus().length,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list', { printSteps: true }],
    ['github'],
    ['html', { outputFolder: './playwright-report/', open: 'never' }],
  ],
  use: {
    headless,
    trace: 'on',
    video: 'on',
    screenshot: 'on',
    baseURL: 'http://localhost:5173/',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15000,
    navigationTimeout: 15000,
    // storageState: 'playwright/.auth/user1.json',
  },
  expect: {
    /* CI/CD is VERY slow, I am sorry */
    timeout: 40_000,
  },
  webServer,
  // globalSetup: './tests/global-auth-setup',
  timeout: 180 * 1000,
  projects: [
    {
      name: 'chromium',
      use: {
        // storageState: 'playwright/.auth/user1.json',
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
