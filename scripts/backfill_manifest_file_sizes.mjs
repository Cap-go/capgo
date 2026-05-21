#!/usr/bin/env bun

/**
 * Backfill manifest.file_size from trusted object storage metadata.
 *
 * Dry-run by default:
 *   bun scripts/backfill_manifest_file_sizes.mjs --app-version-id=180988804
 *
 * Apply updates:
 *   bun scripts/backfill_manifest_file_sizes.mjs --app-version-id=180988804 --apply
 *   bun scripts/backfill_manifest_file_sizes.mjs --all --apply --workers=16
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const MAX_CANDIDATE_BATCH_SIZE = 1000
const PERCENT_ENCODED_OCTET_RE = /%[0-9a-f]{2}/i
const FAILED_CSV_HEADERS = [
  'id',
  'app_id',
  'app_version_id',
  'version_name',
  'file_name',
  's3_path',
  'attempted_s3_path',
  'attempted_s3_paths',
  'status',
  'method',
  'reason',
  'attempts',
  'error_name',
  'error_status',
  'error_message',
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

function getFixedBatchSizeArg() {
  const value = getArgValue('--batch-size')
  if (value === undefined)
    return MAX_CANDIDATE_BATCH_SIZE
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error('--batch-size must be a positive integer')
  if (parsed !== MAX_CANDIDATE_BATCH_SIZE)
    console.warn(`--batch-size=${parsed} is ignored; candidate reads are fixed to ${MAX_CANDIDATE_BATCH_SIZE}`)
  return MAX_CANDIDATE_BATCH_SIZE
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

function decodeStoragePathSegments(s3Path) {
  try {
    return s3Path.split('/').map(segment => decodeURIComponent(segment)).join('/')
  }
  catch {
    return null
  }
}

function encodeStoragePathSegments(s3Path) {
  return s3Path.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function getStorageCandidatePaths(s3Path) {
  const candidates = [s3Path]
  if (PERCENT_ENCODED_OCTET_RE.test(s3Path)) {
    const decoded = decodeStoragePathSegments(s3Path)
    if (decoded && decoded !== s3Path)
      candidates.push(decoded)

    const encoded = encodeStoragePathSegments(s3Path)
    if (encoded !== s3Path)
      candidates.push(encoded)
  }
  return [...new Set(candidates)]
}

function markStorageCandidateResult(result, attemptedS3Path, attemptedS3Paths) {
  const suffix = attemptedS3Path === attemptedS3Paths[0] ? '' : '_candidate'
  return {
    ...result,
    attempted_s3_path: attemptedS3Path,
    attempted_s3_paths: attemptedS3Paths,
    method: `${result.method ?? 'unknown'}${suffix}`,
    reason: suffix && result.reason ? `${result.reason}${suffix}` : result.reason,
  }
}

async function getObjectSizeWithLegacyFallback(s3, s3Path) {
  const candidatePaths = getStorageCandidatePaths(s3Path)
  let lastResult = null

  for (const candidatePath of candidatePaths) {
    const result = markStorageCandidateResult(await getObjectSize(s3, candidatePath), candidatePath, candidatePaths)
    lastResult = result
    if (result.size > 0 || shouldRetryStorageResult(result))
      return result
  }

  return lastResult
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
    const result = await getObjectSizeWithLegacyFallback(s3, s3Path)
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

function createWorkerReport() {
  return {
    batches: 0,
    checked: 0,
    currentBatch: null,
    currentFirstId: null,
    currentLastId: null,
    done: false,
    fixed: 0,
    lastId: null,
    missingSize: 0,
    pages: 0,
    unchanged: 0,
  }
}

function writeReport(outputPath, report) {
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
}

function csvValue(value) {
  if (value === undefined || value === null)
    return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function failedCsvRow(error) {
  return FAILED_CSV_HEADERS.map((header) => {
    if (header === 'error_message')
      return csvValue(error.error?.message)
    if (header === 'error_name')
      return csvValue(error.error?.name)
    if (header === 'error_status')
      return csvValue(error.error?.status)
    return csvValue(error[header])
  }).join(',')
}

function createFailedCsv(outputPath) {
  writeFileSync(outputPath, `${FAILED_CSV_HEADERS.join(',')}\n`)
}

function appendFailedCsvRows(outputPath, errors) {
  if (errors.length === 0)
    return
  appendFileSync(outputPath, `${errors.map(failedCsvRow).join('\n')}\n`)
}

function defaultFailedCsvPath(outputPath) {
  return outputPath.toLowerCase().endsWith('.json')
    ? outputPath.replace(/\.json$/i, '-failed.csv')
    : `${outputPath}-failed.csv`
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
    console.log(`Checked ${report.checked}, ${apply ? 'fixed' : 'fixable'} ${apply ? report.fixed : report.unchanged}, missing ${report.missingSize}, rate ${rate}/s, active workers ${activeWorkers}, batches ${report.claimedBatches}, cursor id ${report.lastClaimedId}`)
  }
}

async function processCandidates({ apply, dbAttempts, pool, s3, storageAttempts, verbose }, candidates) {
  const results = await Promise.all(candidates.map(async (row) => {
    const storage = await getObjectSizeWithRetry(s3, row.s3_path, storageAttempts)
    if (verbose) {
      console.log(`${row.id} ${row.file_name} size=${storage.size} method=${storage.method}${storage.status ? ` status=${storage.status}` : ''} attempts=${storage.attempts}`)
    }
    return { row, storage }
  }))

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
      attempted_s3_path: result.storage.attempted_s3_path,
      attempted_s3_paths: result.storage.attempted_s3_paths,
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

function mergePageReport(report, workerReport, pageReport, failedCsvPath) {
  report.checked += pageReport.checked
  report.fixed += pageReport.fixed
  report.missingSize += pageReport.missingSize
  report.unchanged += pageReport.unchanged
  report.errors.push(...pageReport.missingErrors)
  appendFailedCsvRows(failedCsvPath, pageReport.missingErrors)

  workerReport.checked += pageReport.checked
  workerReport.fixed += pageReport.fixed
  workerReport.missingSize += pageReport.missingSize
  workerReport.unchanged += pageReport.unchanged
  workerReport.pages += 1
}

function createBatchClaimer({ appId, appVersionId, batchSize, dbAttempts, endId, includeDeleted, limit, pool, report, startId, writeProgress }) {
  let afterId = startId
  let claimChain = Promise.resolve()
  let done = false
  let remaining = limit

  return async function claimBatch(workerIndex) {
    const claim = claimChain.then(async () => {
      if (done || remaining <= 0)
        return null

      const query = buildCandidateQuery({
        afterId,
        appId,
        appVersionId,
        endId,
        includeDeleted,
        limit: Math.min(batchSize, remaining),
      })
      const candidates = (await queryWithRetry(pool, query.sql, query.params, `worker ${workerIndex} candidate read`, dbAttempts)).rows
      if (candidates.length === 0) {
        done = true
        return null
      }

      const firstId = candidates[0].id
      const lastId = candidates[candidates.length - 1].id
      const batch = {
        candidates,
        firstId,
        index: report.claimedBatches,
        lastId,
      }

      afterId = lastId
      remaining -= candidates.length
      report.claimedBatches += 1
      report.lastClaimedId = lastId
      writeProgress()

      return batch
    })

    claimChain = claim.catch(() => {})
    return claim
  }
}

async function runBatchWorker({ claimBatch, failedCsvPath, options, report, workerIndex, writeProgress }) {
  const workerReport = report.workers[workerIndex]

  try {
    while (true) {
      const batch = await claimBatch(workerIndex)
      if (!batch)
        break

      workerReport.batches += 1
      workerReport.currentBatch = batch.index
      workerReport.currentFirstId = batch.firstId
      workerReport.currentLastId = batch.lastId
      workerReport.lastId = batch.lastId
      writeProgress()

      const pageReport = await processCandidates(options, batch.candidates)
      mergePageReport(report, workerReport, pageReport, failedCsvPath)
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
  --limit              Max rows to scan without --all. Default: 1000.
  --batch-size         Backward-compatible alias; candidate reads are always 1000.
  --workers            Parallel shared-cursor workers. Default: 8 for --all, 1 otherwise.
  --concurrency        Backward-compatible no-op; storage uses full-batch parallelism for maximum throughput.
  --storage-attempts   Storage metadata attempts per file. Default: 3.
  --db-attempts        DB read/update attempts. Default: 5.
  --start-id           Exclusive lower manifest.id bound for resume.
  --end-id             Inclusive upper manifest.id bound.
  --report             Report JSON output path.
  --failed-csv         Failed metadata CSV output path.
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
  const limit = all ? Number.POSITIVE_INFINITY : getNumberArg('--limit', 1000)
  const workers = getNumberArg('--workers', all ? 8 : 1)
  const batchSize = getFixedBatchSizeArg()
  const storageAttempts = getNumberArg('--storage-attempts', 3)
  const dbAttempts = getNumberArg('--db-attempts', 5)
  const startId = getOptionalNumberArg('--start-id') ?? 0
  const endId = getOptionalNumberArg('--end-id')
  const reportPathArg = getArgValue('--report')
  const failedCsvPathArg = getArgValue('--failed-csv')

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
  const failedCsvPath = failedCsvPathArg
    ? resolve(process.cwd(), failedCsvPathArg)
    : defaultFailedCsvPath(outputPath)
  mkdirSync(dirname(outputPath), { recursive: true })
  mkdirSync(dirname(failedCsvPath), { recursive: true })
  createFailedCsv(failedCsvPath)

  const workerCount = all ? workers : 1
  const storageFanoutPerWorker = batchSize
  const effectiveStorageFanout = storageFanoutPerWorker * workerCount
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
    claimedBatches: 0,
    dbAttempts,
    endedAt: null,
    endId,
    errors: [],
    failedCsvPath,
    fixed: 0,
    includeDeleted,
    lastClaimedId: startId,
    maxBatchSize: MAX_CANDIDATE_BATCH_SIZE,
    missingSize: 0,
    poolMax,
    scannedAt: new Date().toISOString(),
    startId,
    storageAttempts,
    storageFanoutPerWorker,
    effectiveStorageFanout,
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
    console.log(`Scanning manifest.id > ${startId}${endId ? ` and <= ${endId}` : ''} with ${workerCount} workers, page size ${batchSize}, storage fan-out ${storageFanoutPerWorker} per worker (${effectiveStorageFanout} effective), DB pool max ${poolMax}`)

    const claimBatch = createBatchClaimer({
      appId,
      appVersionId,
      batchSize,
      dbAttempts,
      endId,
      includeDeleted,
      limit,
      pool,
      report,
      startId,
      writeProgress,
    })

    for (let workerIndex = 0; workerIndex < workerCount; workerIndex++) {
      report.workers[workerIndex] = createWorkerReport()
    }
    writeProgress(true)

    const workerResults = await Promise.allSettled(Array.from({ length: workerCount }, (_, workerIndex) => runBatchWorker({
      claimBatch,
      failedCsvPath,
      options: {
        apply,
        dbAttempts,
        pool,
        s3,
        storageAttempts,
        verbose,
      },
      report,
      workerIndex,
      writeProgress,
    })))
    const failedWorkers = workerResults
      .map((result, index) => ({ index, result }))
      .filter(({ result }) => result.status === 'rejected')
    if (failedWorkers.length > 0) {
      throw new Error(`${failedWorkers.length} backfill workers failed: ${failedWorkers.map(({ index, result }) => `worker ${index}: ${result.reason?.message ?? result.reason}`).join('; ')}`)
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
  console.log(`  Failed CSV:   ${failedCsvPath}`)

  if (report.missingSize > 0)
    process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
