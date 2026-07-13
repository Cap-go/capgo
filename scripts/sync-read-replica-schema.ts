import type { CloudSqlDataApiResponse } from '../read_replicate/cloud_sql_data_api_response.ts'
import type { Queryable } from '../read_replicate/schema_catalog.ts'
import process from 'node:process'
import { assertCloudSqlDataApiResponseSucceeded } from '../read_replicate/cloud_sql_data_api_response.ts'
import { applyReadReplicaSchemaSync } from '../read_replicate/schema_additive_sync.ts'
import {
  READ_REPLICA_SCHEMA_CATALOG_SQL,
  readReplicaSchemaCatalog,
  stableStringify,
} from '../read_replicate/schema_catalog.ts'
import { readReplicaSchemaCatalogFromMigrations } from '../read_replicate/schema_catalog_from_migrations.ts'
import { readReplicaSchemaCompatibilityIssues } from '../read_replicate/schema_compatibility.ts'

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

async function main(): Promise<void> {
  const maxDurationMs = DEFAULT_SYNC_MAX_SECONDS * 1000
  const deadline = Date.now() + maxDurationMs
  console.log(
    'Building the read-replica schema catalog from local migrations through Tinbase/PGlite...',
  )
  const expected = await readReplicaSchemaCatalogFromMigrations()
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

function googleDataApiClient(
  config: GoogleDataApiConfig,
  deadline: number,
): Queryable {
  const { project, instance, database } = config

  return {
    async query(queryText: string, values?: unknown[]) {
      // The Data API has no session affinity and rejects requests over 0.5 MB or
      // responses over 10 MB. Every partial result is treated as a failed read.
      if (
        queryText.startsWith('SET statement_timeout')
        || queryText === 'RESET statement_timeout'
      ) {
        return { rows: [] }
      }

      const sql
        = queryText === READ_REPLICA_SCHEMA_CATALOG_SQL
          ? renderCatalogQueryWithStaticValues(queryText, values)
          : queryText
      return {
        rows: dataApiRows(
          await executeGoogleSql(project, instance, database, sql, deadline),
        ),
      }
    },
  }
}

async function executeGoogleSql(
  project: string,
  instance: string,
  database: string,
  sql: string,
  deadline: number,
): Promise<DataApiResponse> {
  assertDataApiRequestFitsLimit(database, sql)

  let child: ReturnType<typeof Bun.spawn> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let timedOut = false

  try {
    const commandTimeoutMs = Math.min(
      remainingBudgetMs(deadline),
      (GOOGLE_DATA_API_MAX_SECONDS + GOOGLE_DATA_API_PROCESS_GRACE_SECONDS)
      * 1000,
    )
    const command = Bun.spawn(
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
