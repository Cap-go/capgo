#!/usr/bin/env bun

/**
 * Move active Capgo bundle storage to a clean R2 bucket without downloading objects locally.
 *
 * Safe staged migration:
 *   bun scripts/migrate_r2_bucket.mjs --target prod --source-bucket capgo --target-bucket capgo-clean --phase all --apply --workers=16
 *
 * Stages in --phase all:
 *   1. create-bucket
 *   2. deploy-upload   uploads -> target, downloads -> source with target fallback
 *   3. copy            active app_versions.r2_path + manifest.s3_path by server-side copy
 *   4. verify          target bucket has all active DB keys
 *   5. deploy-download downloads -> target with source fallback
 *
 * Run --phase deploy-final later to remove the old bucket fallback.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCopyCommand,
} from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { parse } from 'dotenv'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, '..')
const FILES_WRANGLER_CONFIG = resolve(ROOT_DIR, 'cloudflare_workers/files/wrangler.jsonc')
const MAX_DB_BATCH_SIZE = 1000
const DEFAULT_MULTIPART_PART_SIZE = 512 * 1024 * 1024
const DEFAULT_ROW_CONCURRENCY = 64
const DEFAULT_PROJECT_REF = 'xvwzpoazmxkqosrdewyv'
const PERCENT_ENCODED_OCTET_RE = /%[0-9a-f]{2}/i

const FAILED_CSV_HEADERS = [
  'kind',
  'record_id',
  'app_id',
  'app_version_id',
  'version_name',
  'key',
  'destination_key',
  'source_bucket',
  'target_bucket',
  'attempted_source_key',
  'attempted_source_keys',
  'db_size',
  'source_size',
  'target_size',
  'status',
  'reason',
  'error_name',
  'error_status',
  'error_message',
]

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
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`)
  return parsed
}

function getTarget() {
  const target = getArgValue('--target') ?? (hasFlag('--local') ? 'local' : 'prod')
  if (target !== 'prod' && target !== 'local')
    throw new Error('--target must be "prod" or "local"')
  return target
}

function printHelp() {
  console.log(`
Usage:
  bun scripts/migrate_r2_bucket.mjs --target-bucket <new-r2-bucket> [options]

Required for mutating/copy phases:
  --target-bucket <name>        Clean R2 bucket to receive active Capgo files

Core options:
  --phase <name>                plan | create-bucket | deploy-upload | copy | verify | deploy-download | deploy-final | all
  --apply                       Actually create/deploy/copy. Without it, the script is a dry-run.
  --target prod|local           Env/DB target. Defaults to prod.
  --source-bucket <name>        Source bucket. Defaults to S3_BUCKET from env.
  --workers <n>                 DB range workers per kind. Defaults to 8.
  --batch-size <n>              Rows per worker batch. Fixed maximum 1000. Defaults to 1000.
  --max-records <n>             Debug cap across copied/verified rows.
  --skip-existing               Skip keys already present in target with the expected DB size.
  --verify-after-copy           HEAD target after every copied object.
  --row-concurrency <n>         Parallel object work per DB worker. Defaults to 64, capped by --batch-size.
  --reset-state                 Ignore previous cursor state for this source/target pair.
  --part-size <bytes>           Multipart copy part size. Defaults to 512 MiB.
  --multipart-concurrency <n>   Parallel part copies for a single >5GiB object. Defaults to 16.

Examples:
  bun scripts/migrate_r2_bucket.mjs --target prod --source-bucket capgo --target-bucket capgo-clean --phase plan
  bun scripts/migrate_r2_bucket.mjs --target prod --source-bucket capgo --target-bucket capgo-clean --phase all --apply --workers=16
  bun scripts/migrate_r2_bucket.mjs --target prod --source-bucket capgo --target-bucket capgo-clean --phase deploy-final --apply
`)
}

if (hasFlag('--help') || hasFlag('-h')) {
  printHelp()
  process.exit(0)
}

const target = getTarget()
const phase = getArgValue('--phase') ?? 'plan'
const apply = hasFlag('--apply')
const workers = getNumberArg('--workers', 8)
const requestedBatchSize = getNumberArg('--batch-size', MAX_DB_BATCH_SIZE)
const batchSize = Math.min(requestedBatchSize, MAX_DB_BATCH_SIZE)
const maxRecords = getOptionalNumberArg('--max-records')
const skipExisting = hasFlag('--skip-existing')
const verifyAfterCopy = hasFlag('--verify-after-copy')
const resetState = hasFlag('--reset-state')
const multipartPartSize = getNumberArg('--part-size', DEFAULT_MULTIPART_PART_SIZE)
const multipartConcurrency = getNumberArg('--multipart-concurrency', 16)
const rowConcurrency = Math.min(getNumberArg('--row-concurrency', Math.min(DEFAULT_ROW_CONCURRENCY, batchSize)), batchSize)
const maxSockets = getNumberArg('--max-sockets', (workers * rowConcurrency) + (multipartConcurrency * workers) + 64)
const projectRef = getArgValue('--project-ref') ?? DEFAULT_PROJECT_REF

if (requestedBatchSize > MAX_DB_BATCH_SIZE)
  console.warn(`--batch-size=${requestedBatchSize} is capped to ${MAX_DB_BATCH_SIZE} so PostgREST/Supabase-style page sizes stay predictable.`)

if (multipartPartSize < 5 * 1024 * 1024)
  throw new Error('--part-size must be at least 5 MiB')

const targetEnvPaths = target === 'prod'
  ? ['../internal/cloudflare/.env.prod']
  : ['../.env.local', '../internal/cloudflare/.env.local']

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

const runtimeEnv = loadEnvFiles(['../.env', ...targetEnvPaths])
for (const [key, value] of Object.entries(runtimeEnv))
  process.env[key] = value

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

const sourceBucket = getArgValue('--source-bucket') ?? process.env.S3_BUCKET ?? 'capgo'
const targetBucket = getArgValue('--target-bucket')

const targetRequiredPhases = new Set(['create-bucket', 'deploy-upload', 'copy', 'verify', 'deploy-download', 'deploy-final', 'all'])
if (targetRequiredPhases.has(phase) && !targetBucket)
  throw new Error('--target-bucket is required for this phase')
if (targetBucket && sourceBucket === targetBucket)
  throw new Error('--source-bucket and --target-bucket must be different')
if (phase === 'all' && maxRecords !== null)
  throw new Error('--max-records is only for debugging individual copy/verify phases, not --phase all')

const DB_URL_ENV_KEYS = [
  'MAIN_SUPABASE_DB_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_DB_DIRECT_URL',
  'DIRECT_URL',
]

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
  const databaseUrl = getDatabaseUrl(process.env)
  if (target === 'prod' && isLocalDatabaseUrl(databaseUrl))
    throw new Error('Refusing to use a local Postgres URL for the default prod target. Pass --target=local only when intentional.')
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

const databaseUrl = ['plan', 'copy', 'verify', 'all'].includes(phase) ? getSafeDatabaseUrl() : null
const pool = databaseUrl
  ? new pg.Pool({
      connectionString: databaseUrl,
      max: Math.max(4, Math.min(workers + 4, 40)),
      ssl: target === 'prod' ? { rejectUnauthorized: true } : undefined,
    })
  : null

let s3Client = null

function getS3Client() {
  if (s3Client)
    return s3Client

  s3Client = new S3Client({
    credentials: {
      accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
    },
    endpoint: getStorageEndpoint(),
    forcePathStyle: true,
    region: process.env.S3_REGION || 'auto',
    requestHandler: new NodeHttpHandler({
      httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets,
      }),
    }),
  })
  return s3Client
}

function sanitizePathPart(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

const outputDir = resolve(ROOT_DIR, 'tmp/r2_bucket_migration', `${sanitizePathPart(sourceBucket)}-to-${sanitizePathPart(targetBucket ?? 'none')}`)
mkdirSync(outputDir, { recursive: true })
const statePath = resolve(outputDir, 'state.json')
const reportPath = resolve(outputDir, `report-${Date.now()}.json`)
const failedCsvPath = resolve(outputDir, `failed-${Date.now()}.csv`)

function csvValue(value) {
  if (value === undefined || value === null)
    return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function failedCsvRow(row) {
  return FAILED_CSV_HEADERS.map(header => csvValue(row[header])).join(',')
}

function appendFailedRows(rows) {
  if (rows.length === 0)
    return
  appendFileSync(failedCsvPath, `${rows.map(failedCsvRow).join('\n')}\n`)
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      status: error.$metadata?.httpStatusCode ?? error.status ?? error.statusCode ?? error.Code ?? error.code,
    }
  }
  return { message: String(error) }
}

function getErrorStatus(error) {
  return error?.$metadata?.httpStatusCode ?? error?.status ?? error?.statusCode ?? error?.Code ?? error?.code
}

function isMissingObjectError(error) {
  const status = getErrorStatus(error)
  const name = error?.name ?? error?.Code ?? error?.code
  return status === 404 || name === 'NoSuchKey' || name === 'NotFound'
}

function isBucketAlreadyExistsError(error) {
  const status = getErrorStatus(error)
  const name = error?.name ?? error?.Code ?? error?.code
  return status === 409 || name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists'
}

function isCopyTooLargeError(error) {
  const name = error?.name ?? error?.Code ?? error?.code
  const message = String(error?.message ?? '')
  return name === 'EntityTooLarge'
    || name === 'InvalidRequest'
    || /too large|maximum allowed size|multipart/i.test(message)
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

function encodeCopySource(bucket, key) {
  return `${encodeURIComponent(bucket)}/${key.split('/').map(segment => encodeURIComponent(segment)).join('/')}`
}

async function queryWithRetry(sql, params, label, attempts = 5) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await pool.query(sql, params)
    }
    catch (error) {
      lastError = error
      const code = error?.code ?? error?.errno
      const message = String(error?.message ?? '')
      const retryable = ['40001', '40P01', '53300', '57P01', '57P02', '57P03', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'].includes(code)
        || /Connection terminated|timeout|ECONNRESET|ETIMEDOUT|terminating connection/i.test(message)
      if (!retryable || attempt >= attempts)
        break
      console.warn(`${label} failed, retrying ${attempt}/${attempts}: ${error.message}`)
      await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }
  throw lastError
}

function buildRangeQuery(kind) {
  if (kind === 'versions') {
    return `
      SELECT MIN(av.id)::bigint AS min_id, MAX(av.id)::bigint AS max_id, COUNT(*)::bigint AS total_rows, COALESCE(SUM(avm.size), 0)::bigint AS total_bytes
      FROM public.app_versions av
      LEFT JOIN public.app_versions_meta avm ON avm.id = av.id
      WHERE av.deleted = false
        AND av.r2_path IS NOT NULL
        AND av.storage_provider <> 'external'
    `
  }

  return `
    SELECT MIN(m.id)::bigint AS min_id, MAX(m.id)::bigint AS max_id, COUNT(*)::bigint AS total_rows, COALESCE(SUM(m.file_size), 0)::bigint AS total_bytes
    FROM public.manifest m
    INNER JOIN public.app_versions av ON av.id = m.app_version_id
    WHERE av.deleted = false
      AND m.s3_path IS NOT NULL
  `
}

function buildPageQuery(kind) {
  if (kind === 'versions') {
    return `
      SELECT
        'versions'::text AS kind,
        av.id::bigint AS id,
        av.id::bigint AS app_version_id,
        av.app_id,
        av.name AS version_name,
        av.r2_path AS key,
        COALESCE(avm.size, 0)::bigint AS db_size
      FROM public.app_versions av
      LEFT JOIN public.app_versions_meta avm ON avm.id = av.id
      WHERE av.id > $1
        AND av.id <= $2
        AND av.deleted = false
        AND av.r2_path IS NOT NULL
        AND av.storage_provider <> 'external'
      ORDER BY av.id
      LIMIT $3
    `
  }

  return `
    SELECT
      'manifest'::text AS kind,
      m.id::bigint AS id,
      m.app_version_id::bigint AS app_version_id,
      av.app_id,
      av.name AS version_name,
      m.s3_path AS key,
      COALESCE(m.file_size, 0)::bigint AS db_size
    FROM public.manifest m
    INNER JOIN public.app_versions av ON av.id = m.app_version_id
    WHERE m.id > $1
      AND m.id <= $2
      AND av.deleted = false
      AND m.s3_path IS NOT NULL
    ORDER BY m.id
    LIMIT $3
  `
}

async function getKindRange(kind) {
  const result = await queryWithRetry(buildRangeQuery(kind), [], `${kind} range`)
  const row = result.rows[0]
  return {
    maxId: row.max_id === null ? 0 : Number(row.max_id),
    minId: row.min_id === null ? 0 : Number(row.min_id),
    totalBytes: Number(row.total_bytes ?? 0),
    totalRows: Number(row.total_rows ?? 0),
  }
}

function splitRange(minId, maxId, count) {
  if (!minId || !maxId || maxId < minId)
    return []
  const size = Math.ceil((maxId - minId + 1) / count)
  const ranges = []
  for (let index = 0; index < count; index++) {
    const startId = minId + (index * size)
    if (startId > maxId)
      break
    ranges.push({
      cursor: startId - 1,
      done: false,
      endId: Math.min(maxId, startId + size - 1),
      index,
      startId,
    })
  }
  return ranges
}

function createFreshState(ranges) {
  return {
    createdAt: new Date().toISOString(),
    sourceBucket,
    targetBucket,
    target,
    updatedAt: new Date().toISOString(),
    workers: ranges,
  }
}

function loadState(ranges) {
  if (resetState || !existsSync(statePath))
    return createFreshState(ranges)

  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  if (state.sourceBucket !== sourceBucket || state.targetBucket !== targetBucket || state.target !== target)
    return createFreshState(ranges)

  for (const kind of Object.keys(ranges)) {
    if (!state.workers?.[kind] || state.workers[kind].length !== ranges[kind].length)
      state.workers[kind] = ranges[kind]
  }

  return state
}

let stateWriteChain = Promise.resolve()

function saveState(state) {
  state.updatedAt = new Date().toISOString()
  stateWriteChain = stateWriteChain.then(() => {
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
  })
  return stateWriteChain
}

const report = {
  apply,
  batches: 0,
  bytesCopied: 0,
  checked: 0,
  copied: 0,
  failed: 0,
  missing: 0,
  phase,
  skipped: 0,
  sourceBucket,
  targetBucket,
  target,
  verified: 0,
}

let recordsLeft = maxRecords

function takeRowsWithinLimit(rows) {
  if (recordsLeft === null)
    return rows
  if (recordsLeft <= 0)
    return []
  const taken = rows.slice(0, recordsLeft)
  recordsLeft -= taken.length
  return taken
}

function createProgressLogger() {
  const startedAt = Date.now()
  let lastLogAt = 0
  return (force = false) => {
    const now = Date.now()
    if (!force && now - lastLogAt < 1000)
      return
    lastLogAt = now
    const seconds = Math.max(1, Math.round((now - startedAt) / 1000))
    console.log(`Checked ${report.checked}, copied ${report.copied}, verified ${report.verified}, skipped ${report.skipped}, missing ${report.missing}, failed ${report.failed}, rate ${Math.round(report.checked / seconds)}/s, batches ${report.batches}`)
  }
}

const logProgress = createProgressLogger()

async function headObject(bucket, key) {
  return await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
}

function getObjectSizeFromHead(head) {
  const size = Number(head.ContentLength ?? 0)
  return Number.isFinite(size) ? size : 0
}

async function targetObjectMatches(row) {
  try {
    const head = await headObject(targetBucket, row.key)
    const size = getObjectSizeFromHead(head)
    return {
      exists: row.db_size <= 0 || size === Number(row.db_size),
      size,
    }
  }
  catch (error) {
    if (isMissingObjectError(error))
      return { exists: false, size: 0 }
    throw error
  }
}

async function copySmallObject(sourceKey, destinationKey) {
  await getS3Client().send(new CopyObjectCommand({
    Bucket: targetBucket,
    CopySource: encodeCopySource(sourceBucket, sourceKey),
    Key: destinationKey,
    MetadataDirective: 'COPY',
  }))
}

function buildMultipartCreateInput(sourceHead, destinationKey) {
  return {
    Bucket: targetBucket,
    CacheControl: sourceHead.CacheControl,
    ContentDisposition: sourceHead.ContentDisposition,
    ContentEncoding: sourceHead.ContentEncoding,
    ContentLanguage: sourceHead.ContentLanguage,
    ContentType: sourceHead.ContentType,
    Expires: sourceHead.Expires,
    Key: destinationKey,
    Metadata: sourceHead.Metadata,
  }
}

async function mapWithConcurrency(items, concurrency, fn) {
  let nextIndex = 0
  const results = new Array(items.length)
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

async function copyLargeObject(sourceKey, destinationKey, sourceHead) {
  const sourceSize = getObjectSizeFromHead(sourceHead)
  if (sourceSize <= 0)
    throw new Error(`Cannot multipart copy ${sourceKey}: source size is missing`)

  const create = await getS3Client().send(new CreateMultipartUploadCommand(buildMultipartCreateInput(sourceHead, destinationKey)))
  const uploadId = create.UploadId
  if (!uploadId)
    throw new Error(`CreateMultipartUpload returned no upload id for ${destinationKey}`)

  const partCount = Math.ceil(sourceSize / multipartPartSize)
  const partNumbers = Array.from({ length: partCount }, (_, index) => index + 1)

  try {
    const completedParts = await mapWithConcurrency(partNumbers, multipartConcurrency, async (partNumber) => {
      const start = (partNumber - 1) * multipartPartSize
      const end = Math.min(sourceSize - 1, start + multipartPartSize - 1)
      const result = await getS3Client().send(new UploadPartCopyCommand({
        Bucket: targetBucket,
        CopySource: encodeCopySource(sourceBucket, sourceKey),
        CopySourceRange: `bytes=${start}-${end}`,
        Key: destinationKey,
        PartNumber: partNumber,
        UploadId: uploadId,
      }))

      const eTag = result.CopyPartResult?.ETag
      if (!eTag)
        throw new Error(`UploadPartCopy returned no ETag for ${destinationKey} part ${partNumber}`)

      return { ETag: eTag, PartNumber: partNumber }
    })

    await getS3Client().send(new CompleteMultipartUploadCommand({
      Bucket: targetBucket,
      Key: destinationKey,
      MultipartUpload: {
        Parts: completedParts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
      UploadId: uploadId,
    }))
  }
  catch (error) {
    await getS3Client().send(new AbortMultipartUploadCommand({
      Bucket: targetBucket,
      Key: destinationKey,
      UploadId: uploadId,
    })).catch(() => {})
    throw error
  }
}

async function copyCandidate(sourceKey, destinationKey) {
  try {
    await copySmallObject(sourceKey, destinationKey)
    return { copied: true, sourceKey, sourceSize: 0 }
  }
  catch (error) {
    if (isMissingObjectError(error))
      return { copied: false, missing: true, sourceKey, error }

    if (!isCopyTooLargeError(error))
      throw error
  }

  const sourceHead = await headObject(sourceBucket, sourceKey)
  await copyLargeObject(sourceKey, destinationKey, sourceHead)
  return { copied: true, multipart: true, sourceKey, sourceSize: getObjectSizeFromHead(sourceHead) }
}

function buildFailure(row, extra) {
  const error = serializeError(extra.error)
  return {
    app_id: row.app_id,
    app_version_id: row.app_version_id,
    attempted_source_key: extra.attemptedSourceKey,
    attempted_source_keys: extra.attemptedSourceKeys,
    db_size: row.db_size,
    destination_key: row.key,
    error_message: error.message,
    error_name: error.name,
    error_status: error.status,
    key: row.key,
    kind: row.kind,
    reason: extra.reason,
    record_id: row.id,
    source_bucket: sourceBucket,
    source_size: extra.sourceSize,
    status: extra.status,
    target_bucket: targetBucket,
    target_size: extra.targetSize,
    version_name: row.version_name,
  }
}

async function copyRow(row) {
  report.checked += 1

  if (!apply) {
    report.skipped += 1
    return null
  }

  if (skipExisting) {
    const existingTarget = await targetObjectMatches(row)
    if (existingTarget.exists) {
      report.skipped += 1
      return null
    }
  }

  const sourceCandidates = getStorageCandidatePaths(row.key)
  let lastError = null
  let lastSourceKey = sourceCandidates[0]

  for (const sourceKey of sourceCandidates) {
    lastSourceKey = sourceKey
    try {
      const result = await copyCandidate(sourceKey, row.key)
      if (!result.copied && result.missing) {
        lastError = result.error
        continue
      }

      let targetSize = 0
      if (verifyAfterCopy) {
        const targetHead = await headObject(targetBucket, row.key)
        targetSize = getObjectSizeFromHead(targetHead)
        if (row.db_size > 0 && targetSize !== Number(row.db_size)) {
          report.failed += 1
          return buildFailure(row, {
            attemptedSourceKey: sourceKey,
            attemptedSourceKeys: sourceCandidates,
            reason: 'target_size_mismatch_after_copy',
            sourceSize: result.sourceSize,
            status: 'mismatch',
            targetSize,
          })
        }
      }

      report.copied += 1
      report.bytesCopied += Number(row.db_size ?? result.sourceSize ?? 0)
      return null
    }
    catch (error) {
      lastError = error
      if (isMissingObjectError(error))
        continue
      break
    }
  }

  report.missing += isMissingObjectError(lastError) ? 1 : 0
  report.failed += isMissingObjectError(lastError) ? 0 : 1
  return buildFailure(row, {
    attemptedSourceKey: lastSourceKey,
    attemptedSourceKeys: sourceCandidates,
    error: lastError,
    reason: isMissingObjectError(lastError) ? 'source_missing' : 'copy_failed',
    status: getErrorStatus(lastError),
  })
}

async function verifyRow(row) {
  report.checked += 1
  const targetCheck = await targetObjectMatches(row)
  if (targetCheck.exists) {
    report.verified += 1
    return null
  }

  report.missing += 1
  return buildFailure(row, {
    attemptedSourceKey: row.key,
    attemptedSourceKeys: [row.key],
    reason: targetCheck.size > 0 ? 'target_size_mismatch' : 'target_missing',
    status: targetCheck.size > 0 ? 'mismatch' : 404,
    targetSize: targetCheck.size,
  })
}

async function processRows(rows, mode) {
  const failures = (await mapWithConcurrency(rows, rowConcurrency, row => mode === 'verify' ? verifyRow(row) : copyRow(row))).filter(Boolean)
  appendFailedRows(failures)
  report.batches += 1
  logProgress()
}

async function runKindWorkers(kind, state, options) {
  const { limitRecords = true, mode, persistState = true } = options
  const workerStates = state.workers[kind] ?? []
  const pageQuery = buildPageQuery(kind)

  await Promise.all(workerStates.map(async (workerState) => {
    while (!workerState.done) {
      if (limitRecords && recordsLeft !== null && recordsLeft <= 0)
        return

      const result = await queryWithRetry(pageQuery, [workerState.cursor, workerState.endId, batchSize], `${kind} ${mode} page worker ${workerState.index}`)
      const rows = limitRecords ? takeRowsWithinLimit(result.rows) : result.rows
      if (rows.length === 0) {
        workerState.done = true
        if (persistState)
          await saveState(state)
        return
      }

      await processRows(rows, mode)
      workerState.cursor = Number(rows.at(-1).id)
      workerState.done = rows.length < batchSize || workerState.cursor >= workerState.endId
      if (persistState)
        await saveState(state)
    }
  }))
}

async function initializeRanges() {
  const versions = await getKindRange('versions')
  const manifest = await getKindRange('manifest')
  return {
    manifest: splitRange(manifest.minId, manifest.maxId, workers),
    versions: splitRange(versions.minId, versions.maxId, workers),
    _summary: { manifest, versions },
  }
}

async function runPlan() {
  const ranges = await initializeRanges()
  console.log(`Target:         ${target}`)
  if (databaseUrl)
    console.log(`Database:       ${describeDatabaseUrl(databaseUrl)}`)
  console.log(`Source bucket:  ${sourceBucket}`)
  console.log(`Target bucket:  ${targetBucket ?? '(not set)'}`)
  console.log(`Workers:        ${workers}`)
  console.log(`Batch size:     ${batchSize}`)
  console.log(`Max sockets:    ${maxSockets}`)
  console.log(`Active zips:    ${ranges._summary.versions.totalRows} (${formatBytes(ranges._summary.versions.totalBytes)})`)
  console.log(`Active manifest:${ranges._summary.manifest.totalRows} (${formatBytes(ranges._summary.manifest.totalBytes)})`)
  console.log(`Active total:   ${ranges._summary.versions.totalRows + ranges._summary.manifest.totalRows} (${formatBytes(ranges._summary.versions.totalBytes + ranges._summary.manifest.totalBytes)})`)
  console.log(`Output dir:     ${outputDir}`)
}

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = Number(bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`
}

async function runCopyOrVerify() {
  writeFileSync(failedCsvPath, `${FAILED_CSV_HEADERS.join(',')}\n`)
  const ranges = await initializeRanges()
  const freshState = {
    manifest: ranges.manifest,
    versions: ranges.versions,
  }
  const state = phase === 'verify' ? createFreshState(freshState) : loadState(freshState)
  await saveState(state)

  console.log(`${apply ? 'Applying' : 'Dry-run'} ${phase} from ${sourceBucket} to ${targetBucket}`)
  console.log(`Database: ${describeDatabaseUrl(databaseUrl)}`)
  console.log(`Workers: ${workers}, batch size: ${batchSize}, row concurrency: ${rowConcurrency}, max sockets: ${maxSockets}`)
  console.log(`State: ${statePath}`)
  console.log(`Failed CSV: ${failedCsvPath}`)

  const mode = phase === 'verify' ? 'verify' : 'copy'
  await runKindWorkers('versions', state, { mode })
  await runKindWorkers('manifest', state, { mode })
  logProgress(true)
}

async function createTargetBucket() {
  if (!targetBucket)
    throw new Error('--target-bucket is required')

  console.log(`${apply ? 'Creating/checking' : 'Would create/check'} R2 bucket ${targetBucket}`)
  if (!apply)
    return

  try {
    await getS3Client().send(new HeadBucketCommand({ Bucket: targetBucket }))
    console.log(`Bucket already exists: ${targetBucket}`)
    return
  }
  catch {
    // Create below.
  }

  try {
    await getS3Client().send(new CreateBucketCommand({ Bucket: targetBucket }))
    console.log(`Created bucket: ${targetBucket}`)
  }
  catch (error) {
    if (isBucketAlreadyExistsError(error)) {
      console.log(`Bucket already exists: ${targetBucket}`)
      return
    }
    throw error
  }
}

function bucketBindingsForDeployStage(stage) {
  if (stage === 'upload') {
    return {
      ATTACHMENT_BUCKET: sourceBucket,
      ATTACHMENT_DOWNLOAD_BUCKET: sourceBucket,
      ATTACHMENT_FALLBACK_BUCKET: targetBucket,
      ATTACHMENT_UPLOAD_BUCKET: targetBucket,
    }
  }

  if (stage === 'download') {
    return {
      ATTACHMENT_BUCKET: targetBucket,
      ATTACHMENT_DOWNLOAD_BUCKET: targetBucket,
      ATTACHMENT_FALLBACK_BUCKET: sourceBucket,
      ATTACHMENT_UPLOAD_BUCKET: targetBucket,
    }
  }

  return {
    ATTACHMENT_BUCKET: targetBucket,
    ATTACHMENT_DOWNLOAD_BUCKET: targetBucket,
    ATTACHMENT_FALLBACK_BUCKET: targetBucket,
    ATTACHMENT_UPLOAD_BUCKET: targetBucket,
  }
}

function s3SecretsForDeployStage(stage) {
  if (stage === 'upload') {
    return {
      S3_BUCKET: sourceBucket,
      S3_DOWNLOAD_BUCKET: sourceBucket,
      S3_FALLBACK_BUCKET: targetBucket,
      S3_UPLOAD_BUCKET: targetBucket,
    }
  }

  if (stage === 'download') {
    return {
      S3_BUCKET: targetBucket,
      S3_DOWNLOAD_BUCKET: targetBucket,
      S3_FALLBACK_BUCKET: sourceBucket,
      S3_UPLOAD_BUCKET: targetBucket,
    }
  }

  return {
    S3_BUCKET: targetBucket,
    S3_DOWNLOAD_BUCKET: targetBucket,
    S3_FALLBACK_BUCKET: targetBucket,
    S3_UPLOAD_BUCKET: targetBucket,
  }
}

function replaceR2BindingBucket(configText, binding, bucket) {
  const re = new RegExp(`(\\{\\s*"binding"\\s*:\\s*"${binding}"\\s*,\\s*"bucket_name"\\s*:\\s*")([^"]+)("\\s*,\\s*"preview_bucket_name"\\s*:\\s*")([^"]+)(")`, 'g')
  const replaced = configText.replace(re, `$1${bucket}$3${bucket}$5`)
  if (replaced === configText)
    throw new Error(`Could not find R2 binding ${binding} in ${FILES_WRANGLER_CONFIG}`)
  return replaced
}

function buildTempWranglerConfig(stage) {
  let configText = readFileSync(FILES_WRANGLER_CONFIG, 'utf8')
  const bindings = bucketBindingsForDeployStage(stage)
  for (const [binding, bucket] of Object.entries(bindings))
    configText = replaceR2BindingBucket(configText, binding, bucket)

  const tempConfig = resolve(outputDir, `wrangler.files.${stage}.jsonc`)
  writeFileSync(tempConfig, configText)
  return tempConfig
}

function runCommand(command, args, label) {
  console.log(`${apply ? 'Running' : 'Would run'} ${label}: ${[command, ...args].join(' ')}`)
  if (!apply)
    return
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: 'inherit',
  })
  if (result.status !== 0)
    throw new Error(`${label} failed with exit code ${result.status}`)
}

function deployFilesWorker(stage) {
  const tempConfig = buildTempWranglerConfig(stage)
  const envArgs = target === 'prod' ? ['--env=prod'] : []
  runCommand('bunx', ['wrangler', 'deploy', '--config', tempConfig, ...envArgs, '--minify'], `files worker ${stage} bucket switch`)
}

function deploySupabaseSecrets(stage) {
  if (target !== 'prod') {
    console.log('Skipping Supabase secret deploy for non-prod target.')
    return
  }
  const secrets = s3SecretsForDeployStage(stage)
  const args = ['supabase', 'secrets', 'set', '--project-ref', projectRef]
  for (const [key, value] of Object.entries(secrets))
    args.push(`${key}=${value}`)
  runCommand('bunx', args, `Supabase S3 ${stage} bucket secrets`)
}

function deployStage(stage) {
  deployFilesWorker(stage)
  deploySupabaseSecrets(stage)
}

async function runAll() {
  await createTargetBucket()
  deployStage('upload')
  await runCopyOrVerify()

  if (!apply) {
    console.log('Dry-run: skipping the verification gate. After a real successful verify, downloads would be switched to the target bucket.')
    deployStage('download')
    return
  }

  const missingBeforeVerify = report.missing
  const failedBeforeVerify = report.failed
  await runVerifyAfterAll()
  if (report.missing > missingBeforeVerify || report.failed > failedBeforeVerify)
    throw new Error(`Verification failed: missing=${report.missing - missingBeforeVerify}, failed=${report.failed - failedBeforeVerify}. Not switching downloads.`)

  deployStage('download')
}

async function runVerifyAfterAll() {
  const ranges = await initializeRanges()
  const verifyState = createFreshState({
    manifest: ranges.manifest,
    versions: ranges.versions,
  })

  console.log(`Verifying target bucket ${targetBucket}`)
  await runKindWorkersWithMode('versions', verifyState, 'verify')
  await runKindWorkersWithMode('manifest', verifyState, 'verify')
  logProgress(true)
}

async function runKindWorkersWithMode(kind, state, mode) {
  await runKindWorkers(kind, state, { limitRecords: false, mode, persistState: false })
}

try {
  if (phase === 'plan') {
    await runPlan()
  }
  else if (phase === 'create-bucket') {
    await createTargetBucket()
  }
  else if (phase === 'deploy-upload') {
    deployStage('upload')
  }
  else if (phase === 'deploy-download') {
    deployStage('download')
  }
  else if (phase === 'deploy-final') {
    deployStage('final')
  }
  else if (phase === 'copy' || phase === 'verify') {
    await runCopyOrVerify()
  }
  else if (phase === 'all') {
    await runAll()
  }
  else {
    throw new Error(`Unknown --phase=${phase}`)
  }
}
finally {
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  await stateWriteChain
  if (pool)
    await pool.end()
}

console.log('\nSummary')
console.log(`  Phase:       ${phase}`)
console.log(`  Mode:        ${apply ? 'apply' : 'dry-run'}`)
console.log(`  Checked:     ${report.checked}`)
console.log(`  Copied:      ${report.copied}`)
console.log(`  Verified:    ${report.verified}`)
console.log(`  Skipped:     ${report.skipped}`)
console.log(`  Missing:     ${report.missing}`)
console.log(`  Failed:      ${report.failed}`)
console.log(`  Bytes copied:${formatBytes(report.bytesCopied)}`)
console.log(`  Report:      ${reportPath}`)
console.log(`  Failed CSV:  ${failedCsvPath}`)
