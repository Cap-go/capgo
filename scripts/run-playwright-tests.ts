import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const backendReadyFile = resolve(process.cwd(), '.context/playwright/backend.ready')
const playwrightArgs = process.argv.slice(2)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForBackend(timeoutMs: number, backend: ReturnType<typeof spawn>) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (backend.exitCode !== null)
      throw new Error(`Playwright backend exited before readiness with code ${backend.exitCode}`)

    if (existsSync(backendReadyFile))
      return

    await sleep(1000)
  }

  throw new Error(`Timed out waiting for Playwright backend readiness marker at ${backendReadyFile}`)
}

function stopExistingPlaywrightBackend() {
  spawnSync('pkill', ['-f', 'supabase-functions.playwright.env'], {
    stdio: 'ignore',
    env: process.env,
  })
}

stopExistingPlaywrightBackend()
rmSync(backendReadyFile, { force: true })

const backend = spawn('bun', ['scripts/serve-backend-playwright.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_READY_FILE: backendReadyFile,
  },
})

const signalHandlers = new Map<NodeJS.Signals, () => void>()

function forwardSignal(signal: NodeJS.Signals) {
  const handler = () => {
    backend.kill(signal)
  }
  signalHandlers.set(signal, handler)
  process.on(signal, handler)
}

forwardSignal('SIGINT')
forwardSignal('SIGTERM')

try {
  await waitForBackend(360_000, backend)

  const playwright = spawn('bunx', ['playwright', 'test', ...playwrightArgs], {
    stdio: 'inherit',
    env: {
      ...process.env,
      SKIP_BACKEND_START: 'true',
    },
  })

  const exitCode = await new Promise<number>((resolve) => {
    playwright.on('exit', (code, signal) => {
      if (signal) {
        backend.kill(signal)
        resolve(1)
        return
      }

      resolve(code ?? 1)
    })
  })

  backend.kill('SIGTERM')
  process.exit(exitCode)
}
catch (error) {
  backend.kill('SIGTERM')
  throw error
}
finally {
  for (const [signal, handler] of signalHandlers)
    process.off(signal, handler)
}
