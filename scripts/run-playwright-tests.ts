import { spawn, spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const backendReadyFile = resolve(repoRoot, '.context/playwright/backend.ready')
const backendReadyTimeoutMs = Number(process.env.PLAYWRIGHT_BACKEND_TIMEOUT_MS || '360000')
const playwrightArgs = process.argv.slice(2)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatChildExit(name: string, child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null)
    return `${name} exited before readiness with code ${child.exitCode}`

  if (child.signalCode !== null)
    return `${name} exited before readiness from signal ${child.signalCode}`

  return null
}

function stopChildProcess(child: ReturnType<typeof spawn> | null, signal: NodeJS.Signals) {
  if (!child || child.exitCode !== null || child.signalCode !== null)
    return

  child.kill(signal)
}

async function waitForBackend(timeoutMs: number, backend: ReturnType<typeof spawn>) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const exitMessage = formatChildExit('Playwright backend', backend)
    if (exitMessage)
      throw new Error(exitMessage)

    if (existsSync(backendReadyFile))
      return

    await sleep(1000)
  }

  throw new Error(`Timed out waiting for Playwright backend readiness marker at ${backendReadyFile}`)
}

function stopExistingPlaywrightBackend() {
  spawnSync('pkill', ['-f', 'supabase-functions.playwright.env'], {
    cwd: repoRoot,
    stdio: 'ignore',
    env: process.env,
  })
}

stopExistingPlaywrightBackend()
rmSync(backendReadyFile, { force: true })

const backend = spawn('bun', ['scripts/serve-backend-playwright.ts'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_READY_FILE: backendReadyFile,
  },
})

const signalHandlers = new Map<NodeJS.Signals, () => void>()
let playwright: ReturnType<typeof spawn> | null = null
let relayingSignal = false

function removeSignalHandlers() {
  for (const [signal, handler] of signalHandlers)
    process.off(signal, handler)
}

function forwardSignal(signal: NodeJS.Signals) {
  const handler = () => {
    if (relayingSignal)
      return

    relayingSignal = true
    stopChildProcess(playwright, signal)
    stopChildProcess(backend, signal)
    removeSignalHandlers()
    process.kill(process.pid, signal)
  }
  signalHandlers.set(signal, handler)
  process.on(signal, handler)
}

forwardSignal('SIGINT')
forwardSignal('SIGTERM')

try {
  await waitForBackend(backendReadyTimeoutMs, backend)

  playwright = spawn('bunx', ['playwright', 'test', ...playwrightArgs], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      SKIP_BACKEND_START: 'true',
    },
  })

  const exitCode = await new Promise<number>((resolve) => {
    playwright.on('exit', (code, signal) => {
      if (signal) {
        stopChildProcess(backend, signal)
        removeSignalHandlers()
        process.kill(process.pid, signal)
        return
      }

      resolve(code ?? 1)
    })
  })

  stopChildProcess(backend, 'SIGTERM')
  process.exit(exitCode)
}
catch (error) {
  stopChildProcess(playwright, 'SIGTERM')
  stopChildProcess(backend, 'SIGTERM')
  throw error
}
finally {
  removeSignalHandlers()
}
