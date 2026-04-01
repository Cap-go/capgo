import type { PlaywrightTestConfig } from '@playwright/test'
import * as os from 'node:os'
import { env } from 'node:process'
import { defineConfig, devices } from '@playwright/test'
import { getSupabaseWorktreeConfig } from './scripts/supabase-worktree-config'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// Keep local and CI Playwright runs headless so they do not steal window focus.
const headless = true

const webServer: PlaywrightTestConfig['webServer'] = []
const { ports: supabasePorts } = getSupabaseWorktreeConfig()
const localSupabaseUrl = `http://localhost:${supabasePorts.api}`
const localApiDomain = `localhost:${supabasePorts.api}/functions/v1`
const localSupabaseAnonKey = env.SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const localStripeEmulatorPort = Number.parseInt(env.STRIPE_EMULATOR_PORT || '4510', 10)
const localStripeApiBaseUrl = env.STRIPE_API_BASE_URL || `http://host.docker.internal:${localStripeEmulatorPort}`

if (!env.SKIP_STRIPE_EMULATOR_START) {
  webServer.push({
    command: `STRIPE_EMULATOR_PORT=${localStripeEmulatorPort} bun run stripe:emulator`,
    port: localStripeEmulatorPort,
    timeout: 60_000,
    reuseExistingServer: true,
    stdout: 'pipe',
  })
}
else {
  console.log('Skipping Stripe emulator server')
}

if (!env.SKIP_BACKEND_START) {
  webServer.push({
    command: `ENV=local STRIPE_SECRET_KEY=sk_test_emulator STRIPE_API_BASE_URL=${localStripeApiBaseUrl} STRIPE_WEBHOOK_SECRET=testsecret WEBAPP_URL=http://localhost:5173 bun run backend:playwright`,
    url: `${localSupabaseUrl}/functions/v1/ok`,
    timeout: 60_000,
    reuseExistingServer: true,
  })
}
else {
  console.log('Skipping backend server')
}

webServer.push({
  command: `ENV=local SUPA_URL=${localSupabaseUrl} SUPA_ANON=${localSupabaseAnonKey} API_DOMAIN=${localApiDomain} CAPTCHA_KEY='' bun run serve:local`,
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
  /* Never retry, the entire thing is stateful and retries will never succeed because of the modifications to supabase in the previous attempt */
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
