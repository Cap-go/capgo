import type { Queryable } from './schema_catalog.ts'
import {
  reconcileReadReplicaSchema,
  type ReadReplicaSchemaReconciliationResult,
  type ReadReplicaSchemaSyncOptions,
} from './schema_additive_sync.ts'

const DIRECT_SCHEMA_LOCK_KEY = '735252313759174011'
const DEFAULT_MAX_DURATION_MS = 30 * 60 * 1000
const DEFAULT_LOCK_WAIT_MS = 2 * 60 * 1000
const LOCK_RETRY_MS = 1000
const LOCK_RELEASE_BUFFER_MS = 5000

export interface DirectReadReplicaSchemaSyncOptions
  extends ReadReplicaSchemaSyncOptions {
  lockWaitMs?: number
}

// This lock intentionally runs only on the direct Cloud SQL connection. Hyperdrive
// uses transaction pooling, so its sessions cannot safely hold an advisory lock
// across separate DDL statements.
export async function reconcileDirectReadReplicaSchema(
  master: Queryable,
  replica: Queryable,
  options: DirectReadReplicaSchemaSyncOptions = {},
): Promise<ReadReplicaSchemaReconciliationResult> {
  const startedAt = Date.now()
  const deadline = options.deadline ?? (
    startedAt + positiveIntegerOrDefault(options.maxDurationMs, DEFAULT_MAX_DURATION_MS)
  )
  const lockDeadline = Math.min(
    deadline - LOCK_RELEASE_BUFFER_MS,
    startedAt + positiveIntegerOrDefault(options.lockWaitMs, DEFAULT_LOCK_WAIT_MS),
  )
  let locked = false

  try {
    while (Date.now() <= lockDeadline) {
      const result = await replica.query(
        'SELECT pg_try_advisory_lock($1::bigint) AS locked',
        [DIRECT_SCHEMA_LOCK_KEY],
      )
      if (result.rows[0]?.locked === true) {
        locked = true
        break
      }
      await waitForLock()
    }

    if (!locked) {
      throw new Error(
        'Timed out waiting for another direct read-replica schema reconciliation to finish',
      )
    }

    const remainingDurationMs = deadline - Date.now()
    if (remainingDurationMs <= LOCK_RELEASE_BUFFER_MS) {
      throw new Error(
        'Read-replica schema reconciliation lock left no time for DDL',
      )
    }

    return await reconcileReadReplicaSchema(master, replica, {
      ...options,
      deadline,
      maxDurationMs: remainingDurationMs,
    })
  }
  finally {
    if (locked) {
      await replica
        .query('SELECT pg_advisory_unlock($1::bigint)', [DIRECT_SCHEMA_LOCK_KEY])
        .catch(() => undefined)
    }
  }
}

async function waitForLock(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, LOCK_RETRY_MS))
}

function positiveIntegerOrDefault(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return fallback

  return Math.trunc(value)
}
