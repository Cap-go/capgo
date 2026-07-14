import type { CloudSqlDataApiResponse } from '../read_replicate/cloud_sql_data_api_response.ts'
import type {
  ReadReplicaSchemaOwnerOperation,
  ReadReplicaSchemaSyncClient,
  ReadReplicaSchemaSyncStatement,
} from '../read_replicate/schema_additive_sync.ts'
import process from 'node:process'
import { assertCloudSqlDataApiResponseSucceeded } from '../read_replicate/cloud_sql_data_api_response.ts'
import { applyReadReplicaSchemaSync } from '../read_replicate/schema_additive_sync.ts'
import {
  READ_REPLICA_SCHEMA_CATALOG_SQL,
  readReplicaSchemaCatalog,
  REPLICA_TABLES,
  stableStringify,
} from '../read_replicate/schema_catalog.ts'
import { readReplicaSchemaCatalogFromMigrations } from '../read_replicate/schema_catalog_from_migrations.ts'
import { readReplicaSchemaCompatibilityIssues } from '../read_replicate/schema_compatibility.ts'

interface BunSubprocess {
  exitCode: number | null
  exited: Promise<number>
  kill: () => void
  stderr: ReadableStream<Uint8Array>
  stdout: ReadableStream<Uint8Array>
}

interface BunRuntime {
  spawn: (command: string[], options: unknown) => BunSubprocess
}

const bunRuntime = (globalThis as unknown as { Bun: BunRuntime }).Bun
const DEFAULT_SYNC_MAX_SECONDS = 30 * 60
const CATALOG_QUERY_BUFFER_MS = 5000
const GOOGLE_DATA_API_MAX_SECONDS = 30
const GOOGLE_DATA_API_PROCESS_GRACE_SECONDS = 5
const GOOGLE_DATA_API_REQUEST_LIMIT_BYTES = 500_000
const GOOGLE_DATA_API_REQUEST_METADATA_BUFFER_BYTES = 1_024
const GOOGLE_DATA_API_RESPONSE_LIMIT_BYTES = 10_000_000

interface DataApiResponse extends CloudSqlDataApiResponse {
  results?: Array<{
    columns?: Array<{ name?: string }>
    partialResult?: boolean
    rows?: Array<{ values?: Array<{ value?: string, nullValue?: boolean }> }>
  }>
}

interface GoogleDataApiConfig {
  project: string
  instance: string
  database: string
}

const GOOGLE_READ_REPLICA: GoogleDataApiConfig = {
  project: 'capgo-394818',
  instance: 'eu-2',
  database: 'postgres',
}

const GOOGLE_READ_REPLICA_IAM_DATABASE_USER = 'capgo-read-replica-ci@capgo-394818.iam'

async function main(): Promise<void> {
  const maxDurationMs = DEFAULT_SYNC_MAX_SECONDS * 1000
  const deadline = Date.now() + maxDurationMs
  console.log(
    'Building the read-replica schema catalog from local migrations through Tinbase/PGlite...',
  )
  const expected = await readReplicaSchemaCatalogFromMigrations()
  await assertGoogleReadReplicaExecutor(
    GOOGLE_READ_REPLICA,
    deadline,
  )
  const replica = googleDataApiClient(GOOGLE_READ_REPLICA, deadline)
  const result = await applyReadReplicaSchemaSync(replica, expected, {
    deadline,
    maxDurationMs,
    statementTimeoutMs: GOOGLE_DATA_API_MAX_SECONDS * 1000,
  })
  const actual = await readReplicaSchemaCatalog(replica)
  const issues = readReplicaSchemaCompatibilityIssues(expected, actual)

  if (issues.length) {
    console.error(
      '::error title=Read-replica schema did not converge::Cloud SQL Data API reconciliation completed with residual drift.',
    )
    console.error(
      stableStringify({ error: 'schema_not_converged', ...result, issues }),
    )
    process.exitCode = 1
    return
  }

  console.log('Read-replica Cloud SQL Data API sync result:')
  console.log(stableStringify({ ...result, issues }))
  console.log(
    'Read replica matches the schema derived from local migrations before primary migrations.',
  )
}

async function assertGoogleReadReplicaExecutor(
  config: GoogleDataApiConfig,
  deadline: number,
): Promise<void> {
  const response = await executeGoogleSql(
    config.project,
    config.instance,
    config.database,
    renderReadReplicaExecutorPreflightSql(),
    deadline,
  )
  assertGoogleReadReplicaExecutorState(dataApiRows(response))
}

export function renderReadReplicaExecutorPreflightSql(): string {
  const replicaTables = REPLICA_TABLES.map(quoteSqlText).join(', ')
  return `SELECT
  session_user AS session_user,
  pg_catalog.pg_has_role(session_user, 'capgo_read_replica_schema_executor', 'member') AS executor_member,
  NOT pg_catalog.pg_has_role(session_user, 'cloudsqlsuperuser', 'member') AS no_cloudsqlsuperuser,
  pg_catalog.has_schema_privilege(session_user, 'capgo_internal', 'USAGE') AS schema_usage,
  pg_catalog.has_function_privilege(
    session_user,
    'capgo_internal.add_read_replica_column(text,text,text,text,boolean)',
    'EXECUTE'
  ) AS add_column_execute,
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[${replicaTables}]::pg_catalog.text[]) AS selected(table_name)
    WHERE pg_catalog.has_table_privilege(
      session_user,
      pg_catalog.format('public.%I', selected.table_name),
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
  ) AS no_table_access`
}

export function assertGoogleReadReplicaExecutorState(
  rows: readonly Record<string, unknown>[],
): void {
  const state = rows[0]
  if (
    state?.session_user !== GOOGLE_READ_REPLICA_IAM_DATABASE_USER
    || !dataApiBoolean(state.executor_member)
    || !dataApiBoolean(state.no_cloudsqlsuperuser)
    || !dataApiBoolean(state.schema_usage)
    || !dataApiBoolean(state.add_column_execute)
    || !dataApiBoolean(state.no_table_access)
  ) {
    throw new Error(
      'Cloud SQL IAM database identity is not limited to capgo_read_replica_schema_executor with owner-executor access only. Install the owner bootstrap and replace cloudsqlsuperuser before primary migrations.',
    )
  }
}

function dataApiBoolean(value: unknown): boolean {
  return value === true || value === 'true'
}

function googleDataApiClient(
  config: GoogleDataApiConfig,
  deadline: number,
): ReadReplicaSchemaSyncClient {
  const { project, instance, database } = config

  return {
    assertCanApplyReadReplicaSchemaPlan(plan) {
      const skipped = plan.skipped[0]
      if (skipped) {
        throw new Error(
          `The least-privilege Cloud SQL owner executor cannot reconcile skipped ${skipped.kind} ${skipped.table}.${skipped.name} (${skipped.reason}); extend its reviewed bootstrap before primary migrations.`,
        )
      }

      for (const statement of plan.statements)
        assertGoogleOwnerExecutorStatement(statement)
    },
    async applyReadReplicaSchemaPlan(plan) {
      const sql = renderReadReplicaOwnerExecutorTransaction(
        plan.statements.map(assertGoogleOwnerExecutorStatement),
      )
      await executeGoogleSql(project, instance, database, sql, deadline)
    },
    async query(queryText: string, values?: unknown[]) {
      // The Data API has no session affinity and rejects requests over 0.5 MB or
      // responses over 10 MB. Every partial result is treated as a failed read.
      if (
        queryText.startsWith('SET statement_timeout')
        || queryText === 'RESET statement_timeout'
      ) {
        return { rows: [] }
      }

      assertGoogleDataApiCatalogQuery(queryText)
      const sql = renderCatalogQueryWithStaticValues(queryText, values)
      return {
        rows: dataApiRows(
          await executeGoogleSql(project, instance, database, sql, deadline),
        ),
      }
    },
  }
}

function assertGoogleOwnerExecutorStatement(
  statement: ReadReplicaSchemaSyncStatement,
): ReadReplicaSchemaOwnerOperation {
  if (!statement.ownerOperation) {
    throw new Error(
      `The least-privilege Cloud SQL owner executor cannot apply ${statement.kind} ${statement.table}.${statement.name}; extend its reviewed bootstrap before primary migrations.`,
    )
  }

  return statement.ownerOperation
}

export function assertGoogleDataApiCatalogQuery(queryText: string): void {
  if (queryText !== READ_REPLICA_SCHEMA_CATALOG_SQL) {
    throw new Error(
      'Cloud SQL Data API schema adapter only permits selected-schema catalog reads outside the owner executor.',
    )
  }
}

export function renderReadReplicaOwnerExecutorSql(
  operation: ReadReplicaSchemaOwnerOperation,
): string {
  const defaultLiteral = operation.defaultLiteral === null
    ? 'NULL'
    : quoteSqlText(operation.defaultLiteral)
  return `SELECT capgo_internal.add_read_replica_column(${[
    quoteSqlText(operation.table),
    quoteSqlText(operation.column),
    quoteSqlText(operation.expectedType),
    defaultLiteral,
    operation.notNull ? 'TRUE' : 'FALSE',
  ].join(', ')})`
}

export function renderReadReplicaOwnerExecutorTransaction(
  operations: readonly ReadReplicaSchemaOwnerOperation[],
): string {
  if (!operations.length)
    throw new Error('Read-replica owner executor requires at least one reviewed operation')

  return `BEGIN;\n${operations.map(renderReadReplicaOwnerExecutorSql).join(';\n')};\nCOMMIT;`
}
async function executeGoogleSql(
  project: string,
  instance: string,
  database: string,
  sql: string,
  deadline: number,
): Promise<DataApiResponse> {
  assertDataApiRequestFitsLimit(database, sql)

  let child: BunSubprocess | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let timedOut = false

  try {
    const commandTimeoutMs = Math.min(
      remainingBudgetMs(deadline),
      (GOOGLE_DATA_API_MAX_SECONDS + GOOGLE_DATA_API_PROCESS_GRACE_SECONDS)
      * 1000,
    )
    const command = bunRuntime.spawn(
      [
        'gcloud',
        'sql',
        'instances',
        'execute-sql',
        instance,
        `--project=${project}`,
        `--database=${database}`,
        `--sql=${sql}`,
        '--format=json',
        '--partial_result_mode=FAIL_PARTIAL_RESULT',
        '--quiet',
      ],
      { stdout: 'pipe', stderr: 'pipe', env: process.env },
    )
    child = command
    timeout = setTimeout(() => {
      timedOut = true
      command.kill()
    }, commandTimeoutMs)

    const [exitCode, stdout, stderr] = await Promise.all([
      command.exited,
      new Response(command.stdout).text(),
      new Response(command.stderr).text(),
    ])
    if (timedOut) {
      throw new Error(
        `Cloud SQL Data API command exceeded its ${GOOGLE_DATA_API_MAX_SECONDS}-second SQL limit.`,
      )
    }
    if (exitCode !== 0)
      throw dataApiCommandError(stderr || stdout)
    const response = JSON.parse(stdout) as DataApiResponse
    assertCloudSqlDataApiResponseSucceeded(
      response,
      dataApiCommandError,
    )
    assertCompleteDataApiResponse(response)
    return response
  }
  finally {
    if (timeout)
      clearTimeout(timeout)
    if (child?.exitCode === null) {
      child.kill()
      await child.exited
    }
  }
}

function assertDataApiRequestFitsLimit(database: string, sql: string): void {
  const payloadBytes = new TextEncoder().encode(
    JSON.stringify({
      database,
      partialResultMode: 'FAIL_PARTIAL_RESULT',
      sqlStatement: sql,
    }),
  ).byteLength
  const maximumPayloadBytes
    = GOOGLE_DATA_API_REQUEST_LIMIT_BYTES
      - GOOGLE_DATA_API_REQUEST_METADATA_BUFFER_BYTES

  if (payloadBytes > maximumPayloadBytes) {
    throw new Error(
      `Cloud SQL Data API SQL payload is ${payloadBytes} bytes and exceeds the safe ${maximumPayloadBytes}-byte budget below its 0.5 MB request limit. Split the DDL before release.`,
    )
  }
}

function assertCompleteDataApiResponse(response: DataApiResponse): void {
  if (response.results?.some(result => result.partialResult)) {
    throw new Error(
      `Cloud SQL Data API returned a partial result. It refuses catalog responses at or above its ${GOOGLE_DATA_API_RESPONSE_LIMIT_BYTES / 1_000_000} MB limit.`,
    )
  }
}

function dataApiRows(response: DataApiResponse): Record<string, any>[] {
  const result = response.results?.[0]
  const columns = result?.columns ?? []
  return (result?.rows ?? []).map((row) => {
    const mapped: Record<string, any> = {}
    for (const [index, column] of columns.entries()) {
      const value = row.values?.[index]
      if (!column.name)
        continue
      if (value?.nullValue) {
        mapped[column.name] = null
        continue
      }
      mapped[column.name]
        = column.name === 'catalog' && value?.value
          ? JSON.parse(value.value)
          : value?.value
    }
    return mapped
  })
}

function renderCatalogQueryWithStaticValues(
  queryText: string,
  values: unknown[] | undefined,
): string {
  const parameters = values ?? []
  if (parameters.length !== 5) {
    throw new Error(
      'Read-replica schema catalog requires five selected-schema parameter arrays.',
    )
  }
  let sql = queryText
  for (const [index, value] of parameters.entries()) {
    const placeholder = `$${index + 1}::text[]`
    if (!sql.includes(placeholder)) {
      throw new Error(
        'Read-replica schema catalog query did not contain its expected parameter placeholders.',
      )
    }
    sql = sql.replaceAll(placeholder, postgresTextArray(value))
  }
  return sql
}

function postgresTextArray(value: unknown): string {
  if (
    !Array.isArray(value)
    || !value.every(entry => typeof entry === 'string')
  ) {
    throw new Error(
      'Read-replica schema catalog parameters must be arrays of selected object names.',
    )
  }
  return `ARRAY[${value.map(quoteSqlText).join(', ')}]::text[]`
}

function quoteSqlText(value: string): string {
  if (value.includes('\0')) {
    throw new Error(
      'Read-replica schema catalog parameters cannot contain null bytes.',
    )
  }
  return `'${value.replaceAll('\'', '\'\'')}'`
}

function remainingBudgetMs(deadline: number): number {
  const remainingMs = deadline - Date.now() - CATALOG_QUERY_BUFFER_MS
  if (remainingMs <= 0) {
    throw new Error(
      'Read-replica schema sync exceeded max duration before it could read the schema catalog.',
    )
  }
  return remainingMs
}

function dataApiCommandError(value: string): Error {
  const output = commandOutput(value)
  if (
    /0\.5\s*mb|request.*(?:size|limit)|payload.*(?:size|limit)/i.test(output)
  ) {
    return new Error(
      'Cloud SQL Data API rejected the SQL request at its 0.5 MB request limit. Split the DDL before release.',
    )
  }
  if (
    /10\s*mb|partial.?result|response.*(?:size|limit)|result.*(?:size|limit)/i.test(
      output,
    )
  ) {
    return new Error(
      'Cloud SQL Data API rejected the response at its 10 MB response limit. Keep the selected schema catalog bounded.',
    )
  }
  return new Error(`Cloud SQL Data API query failed: ${output}`)
}

function commandOutput(value: string): string {
  const message = value.trim().replaceAll(/\s+/g, ' ')
  return message ? message.slice(0, 4096) : 'no diagnostic output'
}

if (import.meta.main) {
  try {
    await main()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`::error title=Read-replica Data API sync failed::${message}`)
    process.exitCode = 1
  }
}
