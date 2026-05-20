#!/usr/bin/env bun

/**
 * Backfill manifest.file_size from trusted object storage metadata.
 *
 * Dry-run by default:
 *   bun scripts/backfill_manifest_file_sizes.mjs --app-version-id=180988804
 *
 * Apply updates:
 *   bun scripts/backfill_manifest_file_sizes.mjs --app-version-id=180988804 --apply
 *   bun scripts/backfill_manifest_file_sizes.mjs --all --apply
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

function getNumberArg(name, fallback) {
  const value = getArgValue(name)
  if (value === undefined)
    return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0)
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

function buildCandidateQuery({ afterId, appId, appVersionId, includeDeleted, limit }) {
  const params = [afterId]
  const where = [
    'm.id > $1',
    '(m.file_size IS NULL OR m.file_size <= 0)',
    'm.s3_path IS NOT NULL',
  ]

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

  params.push(limit)

  return {
    params,
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
  --batch-size         DB page size. Default: 500.
  --concurrency        Storage HEAD/RANGE concurrency. Default: 20.
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
  const batchSize = getNumberArg('--batch-size', 500)
  const concurrency = getNumberArg('--concurrency', 20)

  if (!all && !appVersionId && !appId)
    throw new Error('Pass --app-version-id, --app-id, or --all')
  if (appVersionIdRaw && (!Number.isFinite(appVersionId) || appVersionId <= 0))
    throw new Error('--app-version-id must be a positive integer')

  const databaseUrl = getSafeDatabaseUrl()
  console.log(`Using ${target} database target: ${describeDatabaseUrl(databaseUrl)}`)

  const pool = new pg.Pool({
    connectionString: databaseUrl,
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
    checked: 0,
    errors: [],
    fixed: 0,
    includeDeleted,
    missingSize: 0,
    scannedAt: new Date().toISOString(),
    target,
    unchanged: 0,
  }

  let afterId = 0
  let remaining = limit

  try {
    while (remaining > 0) {
      const pageLimit = all ? batchSize : Math.min(batchSize, remaining)
      const query = buildCandidateQuery({
        afterId,
        appId,
        appVersionId,
        includeDeleted,
        limit: pageLimit,
      })
      const candidates = (await pool.query(query.sql, query.params)).rows
      if (candidates.length === 0)
        break

      afterId = candidates[candidates.length - 1].id
      remaining -= candidates.length

      const results = await mapWithConcurrency(candidates, concurrency, async (row) => {
        const storage = await getObjectSize(s3, row.s3_path)
        if (verbose) {
          console.log(`${row.id} ${row.file_name} size=${storage.size} method=${storage.method}${storage.status ? ` status=${storage.status}` : ''}`)
        }

        if (storage.size <= 0) {
          return {
            row,
            storage,
            updated: false,
          }
        }

        if (!apply) {
          return {
            row,
            storage,
            updated: false,
          }
        }

        const update = await pool.query(
          `
            UPDATE public.manifest
            SET file_size = $1
            WHERE id = $2
              AND (file_size IS NULL OR file_size <= 0)
          `,
          [storage.size, row.id],
        )

        return {
          row,
          storage,
          updated: update.rowCount > 0,
        }
      })

      for (const result of results) {
        report.checked += 1
        if (result.storage.size > 0) {
          if (result.updated)
            report.fixed += 1
          else
            report.unchanged += 1
        }
        else {
          report.missingSize += 1
          report.errors.push({
            app_id: result.row.app_id,
            app_version_id: result.row.app_version_id,
            error: result.storage.error,
            file_name: result.row.file_name,
            id: result.row.id,
            method: result.storage.method,
            reason: result.storage.reason,
            s3_path: result.row.s3_path,
            status: result.storage.status,
            version_name: result.row.version_name,
          })
        }
      }

      console.log(`Checked ${report.checked}, ${apply ? 'fixed' : 'fixable'} ${apply ? report.fixed : report.unchanged}, missing ${report.missingSize}`)

      if (!all && remaining <= 0)
        break
    }
  }
  finally {
    await pool.end()
  }

  const outputDir = resolve(__dirname, '../tmp/manifest_file_size_backfill')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = resolve(outputDir, `manifest-file-size-backfill-${Date.now()}.json`)
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)

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
