import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const baseURL = process.env.CAPGO_MEDIA_BASE_URL ?? 'http://localhost:5173'
const email = process.env.CAPGO_MEDIA_EMAIL ?? `media-onboard-${Date.now()}@example.com`
const password = process.env.CAPGO_MEDIA_PASSWORD ?? `CapgoMedia${Date.now()}!Zx`
const outDir = path.resolve('docs/pr/app-first-onboarding')


async function ensureFreshMediaUser(supabaseUrl, anonKey) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey)
    return

  await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: 'Demo', last_name: 'User' },
    }),
  }).catch(() => {})
}

async function main() {
  await mkdir(outDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    recordVideo: {
      dir: outDir,
      size: { width: 1280, height: 800 },
    },
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  const suffix = Date.now()
  const appName = `Demo App ${suffix}`

  const env = await page.goto(`${baseURL}/login`).then(() => page.evaluate(() => ({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  })))
  await ensureFreshMediaUser(env.supabaseUrl, env.anonKey)
  await page.locator('[data-test="email"]').fill(email)
  await page.locator('[data-test="continue"]').click()
  await page.locator('[data-test="password"]').fill(password)
  await page.locator('[data-test="submit"]').click()
  await page.waitForURL(/\/onboarding\/app/, { timeout: 60000 })

  await page.screenshot({ path: path.join(outDir, '01-app-onboarding.png'), fullPage: true })

  await page.locator('[data-test="app-onboarding-existing-no"]').click()
  await page.locator('[data-test="app-onboarding-name"]').fill(appName)
  await page.screenshot({ path: path.join(outDir, '02-app-details-filled.png'), fullPage: true })
  await page.locator('[data-test="app-onboarding-continue"]').click()
  await page.waitForURL(/\/onboarding\/organization/, { timeout: 60000 })

  await page.screenshot({ path: path.join(outDir, '03-organization-onboarding.png'), fullPage: true })
  await page.locator('[data-test="onboarding-intent-ota"]').click()
  await page.locator('[data-test="onboarding-mode-app-name"]').click()
  await page.locator('[data-test="onboarding-estimated-users-option"]').first().click()
  await page.screenshot({ path: path.join(outDir, '04-organization-app-name-mode.png'), fullPage: true })

  await context.close()
  await browser.close()

  await convertVideoToWebp()
  console.log(`Saved screenshots, video, and webp under ${outDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})


async function convertVideoToWebp() {
  const { execSync } = await import('node:child_process')
  const { readdirSync } = await import('node:fs')
  const videos = readdirSync(outDir).filter(name => name.endsWith('.webm'))
  if (!videos.length)
    return
  const input = path.join(outDir, videos[0])
  const output = path.join(outDir, 'app-first-onboarding.webp')
  execSync(`ffmpeg -y -i ${JSON.stringify(input)} -vf fps=12,scale=1280:-1 -loop 0 -an ${JSON.stringify(output)}`, { stdio: 'inherit' })
}
