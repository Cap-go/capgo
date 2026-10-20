import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Client, Pool, PoolClient } from 'pg'

type PgHandle = Client | Pool
type AccessMode = 'read only' | 'read write'
const accessModes = new WeakMap<object, AccessMode>()
const primaryReadSessions = new WeakMap<object, { close: () => Promise<void> }>()

function isDedicatedReadReplica(source: string) {
  return source.startsWith('HYPERDRIVE_CAPGO_READ_') || source === 'local_read_replica'
}

export function readOnlyStartupOptions(source: string, readOnly: boolean) {
  // Only dedicated read pools may carry a session default. A primary Hyperdrive
  // binding may itself point to a transaction pooler, regardless of its name.
  return readOnly && isDedicatedReadReplica(source) ? '-c default_transaction_read_only=on' : undefined
}

export function getPgAccessMode(client: object): AccessMode {
  return accessModes.get(client) ?? 'read write'
}

export function inheritPgAccessMode(owner: object, client: object) {
  accessModes.set(client, getPgAccessMode(owner))
}

export function isPrimaryReadSession(client: object) {
  return primaryReadSessions.has(client)
}

export async function restrictPrimaryReadClient(db: PgHandle, source: string, readOnly: boolean, hyperdrive: boolean): Promise<PgHandle> {
  accessModes.set(db, readOnly ? 'read only' : 'read write')
  if (!readOnly || isDedicatedReadReplica(source))
    return db

  // API reads that fall back to the primary need a pinned READ ONLY transaction,
  // not SET/default_transaction_read_only, which can leak to the next pool user.
  // Replica hot paths retain their existing routing and connection round trips.
  let client: Client | PoolClient
  try {
    client = hyperdrive ? db as Client : await (db as Pool).connect()
  }
  catch (error) {
    await db.end()
    throw error
  }
  try {
    await client.query('BEGIN READ ONLY')
  }
  catch (error) {
    if (!hyperdrive) {
      (client as PoolClient).release(true)
      await db.end()
    }
    throw error
  }
  accessModes.set(client, 'read only')
  const rawQuery = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>
  let pending = Promise.resolve()
  let closing: Promise<void> | undefined
  let recoveryFailure: Error | undefined
  client.query = ((...args: unknown[]) => {
    const callback = typeof args.at(-1) === 'function' ? args.pop() as (error: unknown, result?: unknown) => void : undefined
    const result = closing
      ? Promise.reject(new Error('Primary read session is closed'))
      : pending.then(async () => {
          if (recoveryFailure)
            throw recoveryFailure
          try {
            return await rawQuery(...args)
          }
          catch (error) {
            // Recover the transaction, never replay the failed statement. Serialize
            // queries with recovery so queued reads cannot run between ROLLBACK and
            // BEGIN READ ONLY, or inherit an aborted transaction from another read.
            try {
              await rawQuery('ROLLBACK')
              await rawQuery('BEGIN READ ONLY')
            }
            catch (cause) {
              recoveryFailure = new Error('Primary read session recovery failed', { cause })
            }
            throw error
          }
        })
    pending = result.then(() => {}, () => {})
    if (callback) {
      void result.then(value => callback(null, value), error => callback(error))
      return
    }
    return result
  }) as typeof client.query
  primaryReadSessions.set(client, {
    close: () => closing ??= (async () => {
      try {
        await pending
        // Cleanup must bypass recovery: a failed ROLLBACK must not start a new
        // transaction while returning the origin connection to Hyperdrive.
        await rawQuery('ROLLBACK')
      }
      finally {
        if (!hyperdrive) {
          (client as PoolClient).release(true)
          await db.end()
        }
      }
    })(),
  })
  // pg-pool checks out an actual pg.Client; retain the existing public handle
  // type, while closePrimaryReadClient owns its release instead of end().
  return client as Client
}

export function closePrimaryReadClient(client: object) {
  return primaryReadSessions.get(client)?.close()
}

export function configureTransactionAccessMode<T extends NodePgDatabase>(database: T, client: object): T {
  const transaction = database.transaction.bind(database)
  database.transaction = (run, config) => {
    // A primary reader is already inside its request's READ ONLY transaction.
    // Starting/committing another root transaction would end that protection.
    if (isPrimaryReadSession(client))
      return Promise.reject(new Error('Cannot start a root transaction inside a primary read session'))
    const mode = getPgAccessMode(client)
    if (mode === 'read only' && config?.accessMode === 'read write')
      return Promise.reject(new Error('Cannot start a read-write transaction on a read-only client'))
    return transaction(run, { ...config, accessMode: mode === 'read only' ? mode : config?.accessMode ?? mode })
  }
  return database
}
