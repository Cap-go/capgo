import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process, { env } from 'node:process'
import { getPlaywrightStripeApiBaseUrl } from './playwright-stripe'
import { getSupabaseWorktreeConfig } from './supabase-worktree-config'

const repoRoot = process.cwd()
const sourceEnvPath = resolve(repoRoot, 'supabase/functions/.env')
const generatedEnvPath = resolve(repoRoot, '.context/playwright/supabase-functions.playwright.env')
const supabaseConfig = getSupabaseWorktreeConfig(repoRoot)

const stripeApiBaseUrl = getPlaywrightStripeApiBaseUrl(env)
const webAppUrl = env.WEBAPP_URL || 'http://localhost:5173'

interface SupabaseStatus {
  API_URL?: string
  ANON_KEY?: string
  PUBLISHABLE_KEY?: string
  SERVICE_ROLE_KEY?: string
  SECRET_KEY?: string
}

function upsertEnvValue(content: string, key: string, value: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matcher = new RegExp(`^${escapedKey}=.*$`, 'm')
  const line = `${key}=${value}`

  if (matcher.test(content))
    return content.replace(matcher, line)

  return content.endsWith('\n') || content.length === 0
    ? `${content}${line}\n`
    : `${content}\n${line}\n`
}

const baseEnv = existsSync(sourceEnvPath) ? readFileSync(sourceEnvPath, 'utf8') : ''
const overriddenEnv = [
  ['STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY || 'sk_test_emulator'],
  ['STRIPE_API_BASE_URL', stripeApiBaseUrl],
  ['STRIPE_WEBHOOK_SECRET', env.STRIPE_WEBHOOK_SECRET || 'testsecret'],
  ['WEBAPP_URL', webAppUrl],
] as const

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseSupabaseStatus(stdout: string): SupabaseStatus | null {
  const jsonStart = stdout.indexOf('{')
  if (jsonStart < 0)
    return null

  try {
    return JSON.parse(stdout.slice(jsonStart)) as SupabaseStatus
  }
  catch {
    return null
  }
}

function getSupabaseStatus(): SupabaseStatus | null {
  const statusResult = spawnSync('bun', ['scripts/supabase-worktree.ts', 'status', '-o', 'json'], {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
  })

  if ((statusResult.status ?? 1) !== 0)
    return null

  return parseSupabaseStatus(statusResult.stdout || '')
}

function hasHealthySupabaseApi(status: SupabaseStatus | null) {
  return Boolean(
    status?.API_URL
    && (status?.ANON_KEY || status?.PUBLISHABLE_KEY)
    && (status?.SERVICE_ROLE_KEY || status?.SECRET_KEY),
  )
}

function stopSupabase() {
  spawnSync('bun', ['run', 'supabase:stop'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  })
}

function stopExistingPlaywrightBackend() {
  spawnSync('pkill', ['-f', 'supabase-functions.playwright.env'], {
    cwd: repoRoot,
    stdio: 'ignore',
    env: process.env,
  })
}

function resetSupabaseDb() {
  const resetResult = spawnSync('bun', ['run', 'supabase:db:reset'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  })

  if ((resetResult.status ?? 1) !== 0)
    process.exit(resetResult.status ?? 1)
}

async function ensureSupabaseStarted() {
  const maxAttempts = 4

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (hasHealthySupabaseApi(getSupabaseStatus()))
      return

    const startResult = spawnSync('bun', ['run', 'supabase:start'], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    })

    if ((startResult.status ?? 1) === 0 && hasHealthySupabaseApi(getSupabaseStatus()))
      return

    stopSupabase()

    if (attempt === maxAttempts)
      process.exit(startResult.status ?? 1)

    await sleep(attempt * 2000)
  }
}

async function waitForFunctionsReady(timeoutMs: number) {
  const apiUrl = getSupabaseStatus()?.API_URL || `http://127.0.0.1:${supabaseConfig.ports.api}`
  const targetUrl = `${apiUrl}/functions/v1/ok`
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(targetUrl)
      if (response.ok)
        return
    }
    catch {
      // Keep polling until the edge runtime serves requests again.
    }

    await sleep(1000)
  }

  throw new Error(`Timed out waiting for Supabase functions at ${targetUrl}`)
}

let envFileContent = baseEnv
for (const [key, value] of overriddenEnv)
  envFileContent = upsertEnvValue(envFileContent, key, value)

mkdirSync(dirname(generatedEnvPath), { recursive: true })
writeFileSync(generatedEnvPath, envFileContent)

stopExistingPlaywrightBackend()
await ensureSupabaseStarted()

// Playwright E2E expects the seeded schema helpers and deterministic fixture data.
if (!env.SKIP_SUPABASE_DB_RESET) {
  resetSupabaseDb()
  await ensureSupabaseStarted()
}

const child = spawn('bun', ['scripts/supabase-worktree.ts', 'functions', 'serve', '--env-file', generatedEnvPath], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
})

await waitForFunctionsReady(60_000)

if (env.PLAYWRIGHT_READY_FILE) {
  mkdirSync(dirname(env.PLAYWRIGHT_READY_FILE), { recursive: true })
  writeFileSync(env.PLAYWRIGHT_READY_FILE, 'ready\n')
}

const signalHandlers = new Map<NodeJS.Signals, () => void>()

function forwardSignal(signal: NodeJS.Signals) {
  const handler = () => {
    child.kill(signal)
  }
  signalHandlers.set(signal, handler)
  process.on(signal, handler)
}

forwardSignal('SIGINT')
forwardSignal('SIGTERM')

child.on('exit', (code, signal) => {
  if (signal) {
    for (const [registeredSignal, handler] of signalHandlers)
      process.off(registeredSignal, handler)
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
