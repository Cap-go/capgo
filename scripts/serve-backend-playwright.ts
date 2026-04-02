import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process, { env } from 'node:process'
import { getPlaywrightStripeApiBaseUrl } from './playwright-stripe'

const repoRoot = process.cwd()
const sourceEnvPath = resolve(repoRoot, 'supabase/functions/.env')
const generatedEnvPath = resolve(repoRoot, '.context/playwright/supabase-functions.playwright.env')

const stripeApiBaseUrl = getPlaywrightStripeApiBaseUrl(env)
const webAppUrl = env.WEBAPP_URL || 'http://localhost:5173'

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

let envFileContent = baseEnv
for (const [key, value] of overriddenEnv)
  envFileContent = upsertEnvValue(envFileContent, key, value)

mkdirSync(dirname(generatedEnvPath), { recursive: true })
writeFileSync(generatedEnvPath, envFileContent)

const startResult = spawnSync('bun', ['run', 'supabase:start'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
})

if ((startResult.status ?? 1) !== 0)
  process.exit(startResult.status ?? 1)

const child = spawn('bun', ['scripts/supabase-worktree.ts', 'functions', 'serve', '--env-file', generatedEnvPath], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
})

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
