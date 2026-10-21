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
  // emulate >= 0.12 binds to 127.0.0.1 by default; the Supabase edge runtime runs in Docker
  // and reaches the emulator through host.docker.internal, so listen on all interfaces.
  hostname: env.STRIPE_EMULATOR_HOSTNAME ?? '0.0.0.0',
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
