import type { Bindings } from './cloudflare.ts'
import { Client } from 'pg'
import { inventoryTransaction } from './r2_inventory.ts'

export const EXPIRY_ROW_BUDGET = 10_000
export const EXPIRY_BATCH_SIZE = 1000
export const EXPIRY_RUNTIME_MS = 20_000
const HEALTH_FRESH_MS = 15_000
interface QueueHealthBinding { metrics: () => Promise<{ backlogCount: number, backlogBytes: number }> }

// Fresh private binding metrics, including both DLQs. Unknown/busy health fails
// closed. Event timestamps are never used as a queue-completeness watermark.
export async function inventoryIngestionHealthy(env: Bindings): Promise<boolean> {
  const queues = [env.INVENTORY_EVENT_QUEUE, env.INVENTORY_REPAIR_QUEUE, env.INVENTORY_EVENT_DLQ, env.INVENTORY_REPAIR_DLQ]
  if (queues.some(queue => !queue || typeof (queue as unknown as QueueHealthBinding).metrics !== 'function'))
    return false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      Promise.all(queues.map(queue => (queue as unknown as QueueHealthBinding).metrics())),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Inventory health timeout')), 5000) }),
    ])
    return result.every(metrics => metrics.backlogCount === 0 && metrics.backlogBytes === 0)
  }
  catch {
    return false
  }
  finally {
    clearTimeout(timer)
  }
}

export async function runScheduledManifestPlaceholderExpiry(env: Bindings): Promise<void> {
  if (env.ENV_NAME !== 'capgo_api-prod')
    return
  const startedAt = Date.now()
  if (!await inventoryIngestionHealthy(env)) {
    console.log(JSON.stringify({ event: 'r2_manifest_expiry_skipped', reason: 'ingestion_health_unknown_or_unhealthy' }))
    return
  }
  const healthAt = Date.now()
  const url = env.HYPERDRIVE_R2_INVENTORY?.connectionString
  if (!url)
    throw new Error('Missing independent inventory binding for placeholder expiry')
  const db = new Client({ connectionString: url, connectionTimeoutMillis: 5000, query_timeout: 6000 })
  let removed = 0
  try {
    await db.connect()
    while (removed < EXPIRY_ROW_BUDGET && Date.now() - startedAt < EXPIRY_RUNTIME_MS && Date.now() - healthAt < HEALTH_FRESH_MS) {
      const count = await inventoryTransaction(db, async () => {
        // Arm the timer before SELECT; a function SET cannot shorten the
        // already-running client statement's deadline.
        await db.query('SET LOCAL statement_timeout = \'5s\'')
        await db.query('SET LOCAL lock_timeout = \'1s\'')
        const result = await db.query<{ removed: number }>('SELECT public.expire_r2_manifest_placeholders($1,$2) AS removed', ['capgo', Math.min(EXPIRY_BATCH_SIZE, EXPIRY_ROW_BUDGET - removed)])
        return result.rows[0].removed
      })
      removed += count
      if (count < EXPIRY_BATCH_SIZE)
        break
    }
    console.log(JSON.stringify({ event: 'r2_manifest_expiry', removed, elapsed_ms: Date.now() - startedAt }))
  }
  finally {
    await db.end()
  }
}
