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


async function signInAndSeedSession(page, supabaseUrl, anonKey) {
  await ensureFreshMediaUser(supabaseUrl, anonKey)

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    throw new Error(`Failed to sign in media user (${response.status}): ${await response.text()}`)
  }

  const session = await response.json()
  const hostname = new URL(supabaseUrl).hostname.split('.')[0]
  const storageKey = `sb-${hostname}-auth-token`

  await page.goto(`${baseURL}/login`)
  await page.evaluate(({ storageKey, session }) => {
    localStorage.setItem(storageKey, JSON.stringify(session))
  }, { storageKey, session })
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

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55411'
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

  await signInAndSeedSession(page, supabaseUrl, anonKey)
  await page.goto(`${baseURL}/onboarding/app`)
  await page.waitForURL(/\/onboarding\/app/, { timeout: 60000 })
  await page.waitForSelector('[data-test="app-onboarding-existing-no"]', { timeout: 60000 })

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
  const { mkdtempSync, readdirSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const videos = readdirSync(outDir).filter(name => name.endsWith('.webm') && !name.startsWith('.'))
  if (!videos.length)
    return

  const input = path.join(outDir, videos[0])
  const output = path.join(outDir, 'app-first-onboarding.webp')
  const framesDir = mkdtempSync(path.join(tmpdir(), 'capgo-onboard-frames-'))

  try {
    execSync(`ffmpeg -y -i ${JSON.stringify(input)} -vf fps=10,scale=1280:-1 ${JSON.stringify(`${framesDir}/frame_%03d.png`)}`, { stdio: 'inherit' })
    const frames = readdirSync(framesDir).filter(name => name.endsWith('.png')).sort()
    if (!frames.length)
      return
    execSync(`img2webp -o ${JSON.stringify(output)} ${frames.map(frame => JSON.stringify(path.join(framesDir, frame))).join(' ')}`, { stdio: 'inherit' })
  }
  finally {
    rmSync(framesDir, { recursive: true, force: true })
  }

  for (const video of videos)
    rmSync(path.join(outDir, video), { force: true })
}
