import { env } from 'node:process'
import { createEmulator } from 'emulate'

const DEFAULT_PORT = 4510
const parsedPort = Number.parseInt(env.STRIPE_EMULATOR_PORT ?? `${DEFAULT_PORT}`, 10)

if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
  throw new Error('STRIPE_EMULATOR_PORT must be a positive integer')
}

const emulator = await createEmulator({
  service: 'stripe' as any,
  port: parsedPort,
  // Loopback by default. Launchers whose Supabase edge runtime runs in Docker (and reaches the
  // emulator through host.docker.internal) opt in with STRIPE_EMULATOR_HOSTNAME=0.0.0.0; CI
  // runners are ephemeral and always run the edge runtime in Docker, so they get it by default.
  hostname: env.STRIPE_EMULATOR_HOSTNAME ?? (env.CI ? '0.0.0.0' : '127.0.0.1'),
})

console.log(`[stripe-emulator] listening on ${emulator.url}`)

let isShuttingDown = false

async function shutdown(signal: string) {
  if (isShuttingDown)
    return

  isShuttingDown = true
  console.log(`[stripe-emulator] shutting down after ${signal}`)
  await emulator.close()
  process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal)
  })
}

await new Promise(() => {})
