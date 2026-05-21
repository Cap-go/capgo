#!/usr/bin/env bun

/**
 * Backfill manifest.file_size from trusted object storage metadata.
 *
 * Dry-run by default:
 *   bun scripts/backfill_manifest_file_sizes.mjs --app-version-id=180988804
 *
 * Apply updates:
 *   bun scripts/backfill_manifest_file_sizes.mjs --app-version-id=180988804 --apply
 *   bun scripts/backfill_manifest_file_sizes.mjs --all --apply --workers=8 --concurrency=160
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { S3Client } from '@bradenmacdonald/s3-lite-client'
import { parse } from 'dotenv'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

function hasFlag(name) {
  return process.argv.includes(name)
}

function getArgValue(name) {
  const prefix = `${name}=`
  const match = process.argv.find(arg => arg.startsWith(prefix))
  if (match) {
    const value = match.slice(prefix.length)
    if (!value)
      throw new Error(`${name} requires a value`)
    return value
  }

  const index = process.argv.indexOf(name)
  if (index !== -1) {
    const value = process.argv[index + 1]
    if (!value || value.startsWith('--'))
      throw new Error(`${name} requires a value`)
    return value
  }

  return undefined
}

function getTarget() {
  if (hasFlag('--help') || hasFlag('-h'))
    return 'prod'
  const target = getArgValue('--target') ?? (hasFlag('--local') ? 'local' : 'prod')
  if (target !== 'prod' && target !== 'local')
    throw new Error('--target must be "prod" or "local"')
  return target
}

const target = getTarget()
const sharedEnvPaths = [
  '../.env',
]
const targetEnvPaths = target === 'prod'
  ? [
      '../internal/cloudflare/.env.prod',
    ]
  : [
      '../.env.local',
      '../internal/cloudflare/.env.local',
    ]

function loadEnvFiles(envPaths) {
  const loaded = {}
  for (const envPath of envPaths) {
    const resolvedPath = resolve(__dirname, envPath)
    if (!existsSync(resolvedPath))
      continue
    Object.assign(loaded, parse(readFileSync(resolvedPath)))
  }
  return loaded
}

const targetEnv = loadEnvFiles(targetEnvPaths)
const runtimeEnv = loadEnvFiles([...sharedEnvPaths, ...targetEnvPaths])

for (const [key, value] of Object.entries(runtimeEnv)) {
  process.env[key] = value
}

const DB_URL_ENV_KEYS = [
  'MAIN_SUPABASE_DB_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_DB_DIRECT_URL',
  'DIRECT_URL',
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getNumberArg(name, fallback) {
  const value = getArgValue(name)
  if (value === undefined)
    return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`)
  return parsed
}

function getOptionalNumberArg(name) {
  const value = getArgValue(name)
  if (value === undefined)
    return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error(`${name} must be a positive integer`)
  return parsed
}

function getDatabaseUrl(databaseEnv) {
  for (const key of DB_URL_ENV_KEYS) {
    const value = databaseEnv[key]
    if (value)
      return value
  }
  throw new Error(`Missing Postgres URL in ${targetEnvPaths.join(', ')}. Set one of: ${DB_URL_ENV_KEYS.join(', ')}`)
}

function isLocalDatabaseUrl(databaseUrl) {
  try {
    let { hostname } = new URL(databaseUrl)
    if (hostname.startsWith('[') && hostname.endsWith(']'))
      hostname = hostname.slice(1, -1)
    return ['127.0.0.1', 'localhost', '::1'].includes(hostname)
  }
  catch {
    return databaseUrl.includes('127.0.0.1')
      || databaseUrl.includes('localhost')
      || databaseUrl.includes('::1')
      || databaseUrl.includes('[::1]')
  }
}

function getSafeDatabaseUrl() {
  const databaseUrl = getDatabaseUrl(targetEnv)
  if (target === 'prod' && isLocalDatabaseUrl(databaseUrl)) {
    throw new Error('Refusing to use a local Postgres URL for the default prod target. Pass --target=local only when you intentionally want local.')
  }
  return databaseUrl
}

function describeDatabaseUrl(databaseUrl) {
  try {
    const { host } = new URL(databaseUrl)
    return host
  }
  catch {
    return 'unknown host'
  }
}

function getRequiredEnv(name) {
  const value = process.env[name]
  if (!value)
    throw new Error(`Missing env var: ${name}`)
  return value
}

function getStorageEndpoint() {
  const endpoint = getRequiredEnv('S3_ENDPOINT')
  return endpoint.includes('://') ? endpoint : `https://${endpoint}`
}

function parseObjectSizeFromHeaders(contentRange, contentLength) {
  if (contentRange && contentRange.includes('/')) {
    const total = Number.parseInt(contentRange.split('/').at(1) ?? '0', 10)
    if (Number.isFinite(total) && total > 0)
      return total
  }

  if (contentLength) {
    const len = Number.parseInt(contentLength, 10)
    if (Number.isFinite(len) && len > 0)
      return len
  }

  return 0
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      status: error.status ?? error.statusCode ?? error.code,
    }
  }
  return { message: String(error) }
}

async function getObjectSize(s3, s3Path) {
  try {
    const stat = await s3.statObject(s3Path, {
      headers: { 'Accept-Encoding': 'identity' },
    })
    const size = Number.isFinite(stat.size) ? stat.size : 0
    if (size > 0)
      return { method: 'head', size }
  }
  catch (error) {
    const rangeResult = await getObjectSizeWithRange(s3, s3Path, 'head_error')
    if (rangeResult.size > 0)
      return rangeResult
    return { ...rangeResult, error: serializeError(error) }
  }

  return await getObjectSizeWithRange(s3, s3Path, 'missing_head_size')
}

function shouldRetryStorageResult(result) {
  if (result.size > 0)
    return false
  if (result.status === 404)
    return false
  return true
}

async function getObjectSizeWithRetry(s3, s3Path, attempts) {
  let lastResult = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await getObjectSize(s3, s3Path)
    lastResult = { ...result, attempts: attempt }
    if (!shouldRetryStorageResult(lastResult))
      return lastResult
    if (attempt < attempts)
      await sleep(250 * attempt)
  }
  return lastResult ?? { attempts: 0, method: 'unknown', size: 0 }
}

async function getObjectSizeWithRange(s3, s3Path, reason) {
  try {
    const url = await s3.getPresignedUrl('GET', s3Path, {
      parameters: { 'x-id': 'GetObject' },
    })
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept-Encoding': 'identity',
        'Range': 'bytes=0-0',
      },
    })
    const contentRange = response.headers.get('content-range') || response.headers.get('Content-Range')
    const contentLength = response.headers.get('content-length') || response.headers.get('Content-Length')
    const size = response.status === 206 && contentRange
      ? parseObjectSizeFromHeaders(contentRange, null)
      : response.status === 200
        ? parseObjectSizeFromHeaders(null, contentLength)
        : 0
    await response.body?.cancel()
    return {
      contentLength,
      contentRange,
      method: 'range',
      reason,
      size,
      status: response.status,
      statusText: response.statusText,
    }
  }
  catch (error) {
    return {
      error: serializeError(error),
      method: 'range',
      reason,
      size: 0,
    }
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = []
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await mapper(items[index])
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

function isRetryableDatabaseError(error) {
  const code = error?.code ?? error?.errno
  const message = String(error?.message ?? '')
  const retryableCodes = [
    '40001',
    '40P01',
    '53300',
    '57P01',
    '57P02',
    '57P03',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
  ]
  return retryableCodes.includes(code) || /Connection terminated|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|terminating connection/i.test(message)
}

async function queryWithRetry(pool, sql, params, label, attempts) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await pool.query(sql, params)
    }
    catch (error) {
      lastError = error
      if (!isRetryableDatabaseError(error) || attempt >= attempts)
        break
      console.warn(`${label} failed, retrying ${attempt}/${attempts}: ${error.message}`)
      await sleep(500 * attempt)
    }
  }
  throw lastError
}

function appendCommonFilters(where, params, { appId, appVersionId, endId, includeDeleted, startId }) {
  if (startId !== undefined && startId !== null) {
    params.push(startId)
    where.push(`m.id > $${params.length}`)
  }

  if (endId !== undefined && endId !== null) {
    params.push(endId)
    where.push(`m.id <= $${params.length}`)
  }

  where.push('(m.file_size IS NULL OR m.file_size <= 0)')
  where.push('m.s3_path IS NOT NULL')

  if (!includeDeleted)
    where.push('av.deleted = false')

  if (appVersionId) {
    params.push(appVersionId)
    where.push(`m.app_version_id = $${params.length}`)
  }

  if (appId) {
    params.push(appId)
    where.push(`av.app_id = $${params.length}`)
  }
}

function buildBoundsQuery({ appId, appVersionId, endId, includeDeleted, startId }) {
  const params = []
  const where = []
  appendCommonFilters(where, params, { appId, appVersionId, endId, includeDeleted, startId })

  return {
    params,
    // ORDER BY id ASC/DESC LIMIT 1 keeps this on the manifest primary-key index.
    sql: `
      WITH first_row AS (
        SELECT m.id
        FROM public.manifest m
        INNER JOIN public.app_versions av ON av.id = m.app_version_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.id ASC
        LIMIT 1
      ),
      last_row AS (
        SELECT m.id
        FROM public.manifest m
        INNER JOIN public.app_versions av ON av.id = m.app_version_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.id DESC
        LIMIT 1
      )
      SELECT
        (SELECT id FROM first_row) AS min_id,
        (SELECT id FROM last_row) AS max_id
    `,
  }
}

function buildCandidateQuery({ afterId, appId, appVersionId, endId, includeDeleted, limit }) {
  const params = [afterId]
  const where = [
    'm.id > $1',
  ]
  appendCommonFilters(where, params, { appId, appVersionId, endId, includeDeleted, startId: null })

  params.push(limit)

  return {
    params,
    // Keep every page as a bounded manifest.id range scan so the primary-key index carries the backfill.
    sql: `
      SELECT
        m.id,
        m.app_version_id,
        m.file_name,
        m.s3_path,
        m.file_size,
        av.app_id,
        av.name AS version_name,
        av.deleted
      FROM public.manifest m
      INNER JOIN public.app_versions av ON av.id = m.app_version_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.id
      LIMIT $${params.length}
    `,
  }
}

function buildBulkUpdateQuery(rows) {
  const params = []
  const values = rows.map((row) => {
    params.push(row.id, row.size)
    const idIndex = params.length - 1
    const sizeIndex = params.length
    return `($${idIndex}::bigint, $${sizeIndex}::bigint)`
  }).join(', ')

  return {
    params,
    sql: `
      UPDATE public.manifest AS m
      SET file_size = v.file_size
      FROM (VALUES ${values}) AS v(id, file_size)
      WHERE m.id = v.id
        AND (m.file_size IS NULL OR m.file_size <= 0)
    `,
  }
}

function createIdRanges(minId, maxId, workers) {
  if (!Number.isFinite(minId) || !Number.isFinite(maxId) || minId <= 0 || maxId <= 0 || minId > maxId)
    return []

  const rangeSize = Math.ceil((maxId - minId + 1) / workers)
  return Array.from({ length: workers }, (_, index) => {
    const start = minId + (index * rangeSize)
    const end = Math.min(maxId, start + rangeSize - 1)
    return start <= end ? { end, index, start } : null
  }).filter(Boolean)
}

function createWorkerReport(range) {
  return {
    checked: 0,
    done: false,
    endId: range.end,
    fixed: 0,
    lastId: range.start - 1,
    missingSize: 0,
    pages: 0,
    startId: range.start,
    unchanged: 0,
  }
}

function writeReport(outputPath, report) {
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
}

function createProgressLogger(report, apply) {
  const startedAt = Date.now()
  let lastLogAt = 0

  return (force = false) => {
    const now = Date.now()
    if (!force && now - lastLogAt < 1000)
      return
    lastLogAt = now
    const elapsedSeconds = Math.max(1, Math.round((now - startedAt) / 1000))
    const rate = Math.round(report.checked / elapsedSeconds)
    const activeWorkers = Object.values(report.workers).filter(worker => !worker.done).length
    const maxLastId = Math.max(0, ...Object.values(report.workers).map(worker => worker.lastId ?? 0))
    console.log(`Checked ${report.checked}, ${apply ? 'fixed' : 'fixable'} ${apply ? report.fixed : report.unchanged}, missing ${report.missingSize}, rate ${rate}/s, active workers ${activeWorkers}, last id ${maxLastId}`)
  }
}

async function processCandidates({ apply, dbAttempts, pool, s3, storageAttempts, storageConcurrency, verbose }, candidates) {
  const results = await mapWithConcurrency(candidates, storageConcurrency, async (row) => {
    const storage = await getObjectSizeWithRetry(s3, row.s3_path, storageAttempts)
    if (verbose) {
      console.log(`${row.id} ${row.file_name} size=${storage.size} method=${storage.method}${storage.status ? ` status=${storage.status}` : ''} attempts=${storage.attempts}`)
    }
    return { row, storage }
  })

  const rowsWithSize = results
    .filter(result => result.storage.size > 0)
    .map(result => ({
      id: result.row.id,
      size: result.storage.size,
    }))

  let fixed = 0
  if (apply && rowsWithSize.length > 0) {
    const update = buildBulkUpdateQuery(rowsWithSize)
    const updateResult = await queryWithRetry(pool, update.sql, update.params, 'bulk manifest file_size update', dbAttempts)
    fixed = updateResult.rowCount ?? 0
  }

  const missingErrors = results
    .filter(result => result.storage.size <= 0)
    .map(result => ({
      app_id: result.row.app_id,
      app_version_id: result.row.app_version_id,
      attempts: result.storage.attempts,
      error: result.storage.error,
      file_name: result.row.file_name,
      id: result.row.id,
      method: result.storage.method,
      reason: result.storage.reason,
      s3_path: result.row.s3_path,
      status: result.storage.status,
      version_name: result.row.version_name,
    }))

  return {
    checked: results.length,
    fixed,
    missingErrors,
    missingSize: missingErrors.length,
    unchanged: rowsWithSize.length - fixed,
  }
}

function mergePageReport(report, workerReport, pageReport) {
  report.checked += pageReport.checked
  report.fixed += pageReport.fixed
  report.missingSize += pageReport.missingSize
  report.unchanged += pageReport.unchanged
  report.errors.push(...pageReport.missingErrors)

  workerReport.checked += pageReport.checked
  workerReport.fixed += pageReport.fixed
  workerReport.missingSize += pageReport.missingSize
  workerReport.unchanged += pageReport.unchanged
  workerReport.pages += 1
}

async function runRangeWorker({ appId, appVersionId, batchSize, dbAttempts, includeDeleted, options, pool, range, report, writeProgress }) {
  const workerReport = report.workers[range.index]
  let afterId = range.start - 1

  try {
    while (afterId < range.end) {
      const query = buildCandidateQuery({
        afterId,
        appId,
        appVersionId,
        endId: range.end,
        includeDeleted,
        limit: batchSize,
      })
      const candidates = (await queryWithRetry(pool, query.sql, query.params, `worker ${range.index} candidate read`, dbAttempts)).rows
      if (candidates.length === 0)
        break

      afterId = candidates[candidates.length - 1].id
      workerReport.lastId = afterId

      const pageReport = await processCandidates(options, candidates)
      mergePageReport(report, workerReport, pageReport)
      writeProgress()
    }
  }
  catch (error) {
    workerReport.error = serializeError(error)
    throw error
  }
  finally {
    workerReport.done = true
    writeProgress(true)
  }
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(`Usage:
  bun scripts/backfill_manifest_file_sizes.mjs --app-version-id=<id> [--apply]
  bun scripts/backfill_manifest_file_sizes.mjs --app-id=<app_id> [--limit=1000] [--apply]
  bun scripts/backfill_manifest_file_sizes.mjs --all --apply

Options:
  --apply              Update manifest.file_size. Without this, dry-run only.
  --all                Scan all manifest rows with missing size.
  --app-version-id     Restrict to one bundle id.
  --app-id             Restrict to one app id.
  --limit              Max rows to scan without --all. Default: 500.
  --batch-size         DB page size per worker. Default: 1000 for --all, 500 otherwise.
  --workers            Parallel manifest.id range workers. Default: 8 for --all, 1 otherwise.
  --concurrency        Total storage HEAD/RANGE concurrency. Default: 120 for --all, 20 otherwise.
  --storage-attempts   Storage metadata attempts per file. Default: 3.
  --db-attempts        DB read/update attempts. Default: 5.
  --start-id           Exclusive lower manifest.id bound for resume.
  --end-id             Inclusive upper manifest.id bound.
  --report             Report JSON output path.
  --include-deleted    Include deleted bundles.
  --target prod|local  Env target. Default: prod.
  --local              Alias for --target=local.
  --verbose            Print every checked row.
`)
    return
  }

  const apply = hasFlag('--apply')
  const all = hasFlag('--all')
  const includeDeleted = hasFlag('--include-deleted')
  const verbose = hasFlag('--verbose')
  const appVersionIdRaw = getArgValue('--app-version-id')
  const appVersionId = appVersionIdRaw ? Number.parseInt(appVersionIdRaw, 10) : null
  const appId = getArgValue('--app-id') ?? null
  const limit = all ? Number.POSITIVE_INFINITY : getNumberArg('--limit', 500)
  const workers = getNumberArg('--workers', all ? 8 : 1)
  const batchSize = getNumberArg('--batch-size', all ? 1000 : 500)
  const concurrency = getNumberArg('--concurrency', all ? 120 : 20)
  const storageAttempts = getNumberArg('--storage-attempts', 3)
  const dbAttempts = getNumberArg('--db-attempts', 5)
  const startId = getOptionalNumberArg('--start-id') ?? 0
  const endId = getOptionalNumberArg('--end-id')
  const reportPathArg = getArgValue('--report')

  if (!all && !appVersionId && !appId)
    throw new Error('Pass --app-version-id, --app-id, or --all')
  if (appVersionIdRaw && (!Number.isFinite(appVersionId) || appVersionId <= 0))
    throw new Error('--app-version-id must be a positive integer')
  if (!all && workers !== 1)
    throw new Error('--workers is only supported with --all')
  if (endId !== null && endId <= startId)
    throw new Error('--end-id must be greater than --start-id')

  const databaseUrl = getSafeDatabaseUrl()
  console.log(`Using ${target} database target: ${describeDatabaseUrl(databaseUrl)}`)

  const outputDir = resolve(__dirname, '../tmp/manifest_file_size_backfill')
  const outputPath = reportPathArg
    ? resolve(process.cwd(), reportPathArg)
    : resolve(outputDir, `manifest-file-size-backfill-${Date.now()}.json`)
  mkdirSync(dirname(outputPath), { recursive: true })

  const workerCount = all ? workers : 1
  const storageConcurrencyPerWorker = Math.max(1, Math.floor(concurrency / workerCount))
  const effectiveStorageConcurrency = storageConcurrencyPerWorker * workerCount
  const poolMax = Math.min(Math.max(workerCount * 2 + 4, 4), 40)

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: poolMax,
    ssl: target === 'prod' ? { rejectUnauthorized: false } : false,
  })
  const s3 = new S3Client({
    accessKey: getRequiredEnv('S3_ACCESS_KEY_ID'),
    bucket: getRequiredEnv('S3_BUCKET'),
    endPoint: getStorageEndpoint(),
    pathStyle: true,
    region: process.env.S3_REGION || 'auto',
    secretKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
  })

  const report = {
    apply,
    appId,
    appVersionId,
    batchSize,
    checked: 0,
    concurrency,
    dbAttempts,
    endedAt: null,
    endId,
    errors: [],
    fixed: 0,
    includeDeleted,
    missingSize: 0,
    poolMax,
    scannedAt: new Date().toISOString(),
    startId,
    storageAttempts,
    storageConcurrencyPerWorker,
    effectiveStorageConcurrency,
    target,
    unchanged: 0,
    workerCount,
    workers: {},
  }

  const logProgress = createProgressLogger(report, apply)
  const writeProgress = (force = false) => {
    writeReport(outputPath, report)
    logProgress(force)
  }

  try {
    if (all) {
      const boundsQuery = buildBoundsQuery({
        appId,
        appVersionId,
        endId,
        includeDeleted,
        startId,
      })
      const bounds = (await queryWithRetry(pool, boundsQuery.sql, boundsQuery.params, 'manifest id bounds', dbAttempts)).rows[0]
      const minId = Number.parseInt(bounds?.min_id ?? '0', 10)
      const maxId = Number.parseInt(bounds?.max_id ?? '0', 10)
      const ranges = createIdRanges(minId, maxId, workerCount)

      console.log(`Scanning manifest.id ${minId}-${maxId} with ${ranges.length} workers, page size ${batchSize}, effective storage concurrency ${effectiveStorageConcurrency}, DB pool max ${poolMax}`)

      for (const range of ranges) {
        report.workers[range.index] = createWorkerReport(range)
      }
      writeProgress(true)

      const workerResults = await Promise.allSettled(ranges.map(range => runRangeWorker({
        appId,
        appVersionId,
        batchSize,
        dbAttempts,
        includeDeleted,
        options: {
          apply,
          dbAttempts,
          pool,
          s3,
          storageAttempts,
          storageConcurrency: storageConcurrencyPerWorker,
          verbose,
        },
        pool,
        range,
        report,
        writeProgress,
      })))
      const failedWorkers = workerResults
        .map((result, index) => ({ index, result }))
        .filter(({ result }) => result.status === 'rejected')
      if (failedWorkers.length > 0) {
        throw new Error(`${failedWorkers.length} backfill workers failed: ${failedWorkers.map(({ index, result }) => `worker ${index}: ${result.reason?.message ?? result.reason}`).join('; ')}`)
      }
    }
    else {
      const range = {
        end: endId ?? Number.MAX_SAFE_INTEGER,
        index: 0,
        start: startId + 1,
      }
      report.workers[0] = createWorkerReport(range)
      let remaining = limit
      while (remaining > 0) {
        const pageLimit = Math.min(batchSize, remaining)
        const query = buildCandidateQuery({
          afterId: report.workers[0].lastId,
          appId,
          appVersionId,
          endId,
          includeDeleted,
          limit: pageLimit,
        })
        const candidates = (await queryWithRetry(pool, query.sql, query.params, 'candidate read', dbAttempts)).rows
        if (candidates.length === 0)
          break

        report.workers[0].lastId = candidates[candidates.length - 1].id
        remaining -= candidates.length

        const pageReport = await processCandidates({
          apply,
          dbAttempts,
          pool,
          s3,
          storageAttempts,
          storageConcurrency: concurrency,
          verbose,
        }, candidates)
        mergePageReport(report, report.workers[0], pageReport)
        writeProgress()
      }
      report.workers[0].done = true
    }
  }
  finally {
    report.endedAt = new Date().toISOString()
    writeProgress(true)
    await pool.end()
  }

  console.log('\nSummary')
  console.log(`  Mode:         ${apply ? 'apply' : 'dry-run'}`)
  console.log(`  Checked:      ${report.checked}`)
  console.log(`  ${apply ? 'Fixed' : 'Fixable'}:      ${apply ? report.fixed : report.unchanged}`)
  console.log(`  Missing size: ${report.missingSize}`)
  console.log(`  Report:       ${outputPath}`)

  if (report.missingSize > 0)
    process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
