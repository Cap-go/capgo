import type { SQL } from 'drizzle-orm'
import type { Context } from 'hono'
import type { JWTClaims } from '../utils/hono.ts'
import type { PgQueryClient } from '../utils/pg.ts'
import type { ConsoleQueryRequest, ConsoleQueryResult, QueryCatalog, QueryColumn, QueryForeignKey, QueryFunction } from './console_query_sql.ts'
import { sql } from 'drizzle-orm'
import { CONSOLE_RPCS } from '../utils/console_query_allowlist.ts'
import { cloudlogErr } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient, withPgTransaction } from '../utils/pg.ts'
import { readPgErrorField } from '../utils/pg_errors.ts'
import { compileConsoleQuery, ConsoleQueryError, consoleQueryFailure, functionFromCatalogRow, shapeConsoleQueryResult } from './console_query_sql.ts'

// Console reads and writes stay on the primary. RLS calls auth.uid() and other
// functions that logical replicas do not have.
export type ConsoleQuerySession = { role: 'authenticated', claims: JWTClaims } | { role: 'anon' }

interface FunctionRow {
  name: string
  returns_set: boolean
  arg_count: number
  arg_names: Array<string | null> | null
  arg_modes: string[] | null
  return_kind: string
  arg_types: string[] | null
  default_count: number | string | null
}

let catalogTask: Promise<QueryCatalog> | null = null

export function clearConsoleQueryCatalogCache() {
  catalogTask = null
}

async function readCatalog(client: PgQueryClient): Promise<QueryCatalog> {
  const columns = await client.query<{ table_name: string, column_name: string, udt: string }>(`
    SELECT c.relname AS table_name, a.attname AS column_name, t.typname AS udt
    FROM pg_catalog.pg_attribute AS a
    JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_type AS t ON t.oid = a.atttypid
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v')
      AND a.attnum > 0
      AND NOT a.attisdropped
  `)
  const keys = await client.query<QueryForeignKey>(`
    SELECT con.conname AS name,
      src.relname AS "sourceTable",
      sa.attname AS "sourceColumn",
      dst.relname AS "targetTable",
      da.attname AS "targetColumn",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS uniq
        WHERE uniq.conrelid = con.conrelid
          AND uniq.contype IN ('u', 'p')
          AND uniq.conkey = con.conkey
      ) AS "unique"
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS src ON src.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS sn ON sn.oid = src.relnamespace
    JOIN pg_catalog.pg_class AS dst ON dst.oid = con.confrelid
    JOIN pg_catalog.pg_namespace AS dn ON dn.oid = dst.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS sk(attnum, ord) ON true
    JOIN pg_catalog.pg_attribute AS sa ON sa.attrelid = src.oid AND sa.attnum = sk.attnum
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS dk(attnum, ord) ON dk.ord = sk.ord
    JOIN pg_catalog.pg_attribute AS da ON da.attrelid = dst.oid AND da.attnum = dk.attnum
    WHERE con.contype = 'f'
      AND sn.nspname = 'public'
      AND dn.nspname = 'public'
      AND cardinality(con.conkey) = 1
  `)
  const functions = await client.query<FunctionRow>(`
    SELECT p.proname AS name,
      p.proretset AS returns_set,
      p.pronargs AS arg_count,
      p.pronargdefaults AS default_count,
      p.proargnames AS arg_names,
      p.proargmodes AS arg_modes,
      ret.typtype AS return_kind,
      ARRAY(
        SELECT typ.typname::text
        FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS args(oid, ord)
        JOIN pg_catalog.pg_type AS typ ON typ.oid = args.oid
        ORDER BY args.ord
      )::text[] AS arg_types
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_type AS ret ON ret.oid = p.prorettype
    WHERE n.nspname = 'public'
      AND p.proname = ANY($1::text[])
  `, [[...CONSOLE_RPCS]])

  const columnMap = new Map<string, QueryColumn[]>()
  for (const row of columns.rows) {
    const list = columnMap.get(row.table_name) ?? []
    list.push({ name: row.column_name, udt: row.udt })
    columnMap.set(row.table_name, list)
  }
  const fns: QueryFunction[] = []
  for (const row of functions.rows) {
    const fn = functionFromCatalogRow(row)
    if (fn)
      fns.push(fn)
  }
  return { columns: columnMap, foreignKeys: keys.rows, functions: fns }
}

function loadCatalog(client: PgQueryClient): Promise<QueryCatalog> {
  // Schema changes show up after the next isolate. A failed read is not cached.
  if (!catalogTask) {
    catalogTask = readCatalog(client).catch((error: unknown) => {
      catalogTask = null
      throw error
    })
  }
  return catalogTask
}

function bindValue(value: unknown): SQL {
  // sql`${array}` becomes a parenthesized list of parameters. `.in()` needs one array value.
  return Array.isArray(value) ? sql`${sql.param(value)}` : sql`${value}`
}

// Placeholders are $N outside quotes. A $N inside a literal or identifier
// (a JSON key "$1", or the characters $1 in a quoted label) is text.
export function drizzleFrom(text: string, values: unknown[]): SQL {
  const chunks: SQL[] = []
  let raw = ''
  const pushRaw = () => {
    if (!raw)
      return
    chunks.push(sql.raw(raw))
    raw = ''
  }
  const takeQuote = (quote: '\'' | '"', from: number): number => {
    raw += quote
    for (let index = from; index < text.length; index++) {
      raw += text[index]
      if (text[index] !== quote)
        continue
      if (text[index + 1] === quote) {
        raw += text[index + 1]
        index++
        continue
      }
      return index
    }
    return text.length - 1
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '\'' || char === '"') {
      index = takeQuote(char, index + 1)
      continue
    }
    if (char === '$') {
      const dollarQuote = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index))
      if (dollarQuote) {
        const closer = dollarQuote[0]
        const end = text.indexOf(closer, index + closer.length)
        const stop = end === -1 ? text.length : end + closer.length
        raw += text.slice(index, stop)
        index = stop - 1
        continue
      }
      const placeholder = /^\$(\d+)/.exec(text.slice(index))
      if (placeholder) {
        pushRaw()
        chunks.push(bindValue(values[Number(placeholder[1]) - 1]))
        index += placeholder[0].length - 1
        continue
      }
    }
    raw += char
  }
  pushRaw()
  if (chunks.length === 1)
    return chunks[0]
  if (!chunks.length)
    return sql.raw('')
  return sql.join(chunks, sql.raw(''))
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result))
    return result as Array<Record<string, unknown>>
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as { rows: unknown }).rows))
    return (result as { rows: Array<Record<string, unknown>> }).rows
  return []
}

const NODE_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
])

function isInfrastructureSqlState(code: string): boolean {
  // Connection, capacity, and shutdown. A statement timeout (57014) stays a query result.
  return code.startsWith('08') || code.startsWith('53') || code === '57P01' || code === '57P02' || code === '57P03'
}

function isDriverQueryError(error: unknown, code: string): boolean {
  if (!/^[0-9A-Z]{5}$/.test(code))
    return false
  const severity = readPgErrorField(error, 'severity')
  if (typeof severity === 'string' && /^(?:ERROR|FATAL|PANIC|WARNING)$/i.test(severity))
    return true
  if (readPgErrorField(error, 'routine') !== undefined)
    return true
  return readPgErrorField(error, 'name') === 'DatabaseError'
}

function driverMessage(error: unknown): string {
  const message = readPgErrorField(error, 'message')
  if (typeof message === 'string' && message.length > 0 && !message.startsWith('Failed query:'))
    return message
  return 'Database error'
}

// Connection and node failures stay thrown so a read can retry. Only a driver
// SQLSTATE becomes the PostgREST-shaped body, and never the Drizzle wrapper text.
export function readSqlError(error: unknown): { code: string, message: string } | null {
  let current: unknown = error
  for (let depth = 0; depth < 8 && current; depth++) {
    const code = readPgErrorField(current, 'code')
    if (typeof code === 'string') {
      if (NODE_ERROR_CODES.has(code) || isInfrastructureSqlState(code))
        return null
      if (isDriverQueryError(current, code))
        return { code, message: driverMessage(current) }
    }
    current = readPgErrorField(current, 'cause')
  }
  return null
}

export function statusForSqlState(code: string, role: ConsoleQuerySession['role']): number {
  // 42501 is "permission denied". An anonymous caller has no session (401).
  // An authenticated caller does, so the same SQLSTATE is forbidden (403).
  if (code === '42501')
    return role === 'authenticated' ? 403 : 401
  if (code.startsWith('23'))
    return 409
  return 400
}

async function applyRole(db: { execute: (query: SQL) => Promise<unknown> }, session: ConsoleQuerySession) {
  const claims = session.role === 'authenticated'
    ? { ...session.claims, sub: session.claims.sub, role: 'authenticated' }
    : { role: 'anon' }
  await db.execute(sql`SELECT
    pg_catalog.set_config('request.jwt.claims', ${JSON.stringify(claims)}, true),
    pg_catalog.set_config('request.jwt.claim.sub', ${session.role === 'authenticated' ? session.claims.sub : ''}, true),
    pg_catalog.set_config('request.jwt.claim.role', ${session.role}, true),
    pg_catalog.set_config('request.jwt.claim.email', ${session.role === 'authenticated' ? session.claims.email ?? '' : ''}, true),
    pg_catalog.set_config('request.jwt.claim.aal', ${session.role === 'authenticated' ? session.claims.aal ?? '' : ''}, true),
    pg_catalog.set_config('request.headers', ${'{}'}, true)
  `)
  // SET ROLE changes current_user and leaves session_user as the login role.
  // Triggers and helpers treat session_user = postgres as a service caller.
  // SESSION AUTHORIZATION changes both and drops BYPASSRLS. Fail closed if the
  // role cannot be assumed; never continue as the service connection.
  await db.execute(session.role === 'anon'
    ? sql`SET LOCAL SESSION AUTHORIZATION anon`
    : sql`SET LOCAL SESSION AUTHORIZATION authenticated`)
  await db.execute(sql`SET LOCAL row_security = on`)
}

export async function runConsoleQuery(c: Context, request: ConsoleQueryRequest, session: ConsoleQuerySession): Promise<ConsoleQueryResult> {
  const pool = await getPgClient(c, false)
  try {
    return await withPgTransaction(pool, async (client) => {
      const catalog = await loadCatalog(client)
      const compiled = compileConsoleQuery(catalog, request)
      // Filters carry emails and search text. Keep them out of the query log.
      const db = getDrizzleClient(client, { logger: false })
      await applyRole(db, session)
      const result = await db.execute(drizzleFrom(compiled.text, compiled.values))
      return shapeConsoleQueryResult(compiled, rowsOf(result))
    })
  }
  catch (error) {
    if (error instanceof ConsoleQueryError)
      return consoleQueryFailure(error)
    const sqlError = readSqlError(error)
    if (!sqlError)
      throw error
    cloudlogErr({ requestId: c.get('requestId'), message: 'console query failed', code: sqlError.code })
    return {
      data: null,
      error: { message: sqlError.message, code: sqlError.code, details: null },
      count: null,
      status: statusForSqlState(sqlError.code, session.role),
    }
  }
  finally {
    await closeClient(c, pool)
  }
}
