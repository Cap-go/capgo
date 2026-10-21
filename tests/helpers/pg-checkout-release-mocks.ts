/** Test doubles for checkoutPgClient/releasePgClient (non-Hyperdrive Pool path). */
export async function checkoutPgClient(pg: { connect: () => Promise<unknown> }) {
  return await pg.connect()
}

export function releasePgClient(
  _pg: unknown,
  client: { release?: (error?: boolean | Error) => void } | null | undefined,
  error?: boolean | Error,
): void {
  if (client && 'release' in client)
    client.release?.(error)
}

/** Mirrors production beginWriteTransaction for unit mocks that replace utils/pg. */
export async function beginWriteTransaction(client: { query: (queryText: string) => Promise<unknown> }) {
  await client.query('BEGIN')
}

/** True for plain BEGIN and the production bounded BEGIN batch. */
export function isBeginTransactionSql(sql: unknown): boolean {
  const text = String(sql)
  return text === 'BEGIN' || text.startsWith('BEGIN READ WRITE') || text.startsWith('BEGIN READ ONLY') || text.startsWith('BEGIN;')
}
