#!/usr/bin/env node

/**
 * Bundle Health Checker
 *
 * Checks whether all manifest files for a given bundle actually exist in R2.
 * Spoofs the manifest download flow that devices perform, identifying files
 * that would cause download_manifest_file_fail on real devices.
 *
 * Usage:
 *   node scripts/bundle-health.mjs <app_version_id>
 *   node scripts/bundle-health.mjs <app_id> <version_name>
 *
 * Examples:
 *   node scripts/bundle-health.mjs 12345
 *   node scripts/bundle-health.mjs com.example.app 1.2.3
 */

import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync } from 'fs'
import pg from 'pg'
import { S3Client } from '@bradenmacdonald/s3-lite-client'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../internal/cloudflare/.env.prod') })

// ── Config ───────────────────────────────────────────────────────────────────

const DB_URL = process.env.MAIN_SUPABASE_DB_URL
const S3_ENDPOINT = process.env.S3_ENDPOINT
const S3_REGION = process.env.S3_REGION || 'auto'
const S3_BUCKET = process.env.S3_BUCKET
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY

const CONCURRENCY = 20

for (const [name, val] of Object.entries({ DB_URL, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY })) {
  if (!val) {
    console.error(`Missing env var: ${name}`)
    process.exit(1)
  }
}

// ── Clients ──────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })

const s3 = new S3Client({
  endPoint: `https://${S3_ENDPOINT}`,
  accessKey: S3_ACCESS_KEY_ID,
  secretKey: S3_SECRET_ACCESS_KEY,
  region: S3_REGION,
  bucket: S3_BUCKET,
  pathStyle: true,
})

// ── Resolve bundle ───────────────────────────────────────────────────────────

async function resolveAppVersionId(args) {
  if (args.length === 1 && /^\d+$/.test(args[0])) {
    return Number(args[0])
  }

  if (args.length === 2) {
    const [appId, versionName] = args
    const res = await pool.query(
      `SELECT id FROM app_versions WHERE app_id = $1 AND name = $2 AND deleted = false LIMIT 1`,
      [appId, versionName],
    )
    if (res.rows.length === 0) {
      console.error(`No bundle found for app_id="${appId}" version_name="${versionName}"`)
      process.exit(1)
    }
    return res.rows[0].id
  }

  console.error('Usage: node internal/bundle-health.mjs <app_version_id>')
  console.error('       node internal/bundle-health.mjs <app_id> <version_name>')
  process.exit(1)
}

// ── Fetch manifest entries ───────────────────────────────────────────────────

async function fetchManifest(appVersionId) {
  const res = await pool.query(
    `SELECT id, file_name, file_hash, s3_path, file_size
     FROM manifest
     WHERE app_version_id = $1
     ORDER BY file_name`,
    [appVersionId],
  )
  return res.rows
}

// ── Fetch bundle metadata ────────────────────────────────────────────────────

async function fetchBundleMeta(appVersionId) {
  const res = await pool.query(
    `SELECT av.id, av.name, av.app_id, av.r2_path, av.checksum, av.manifest_count,
            av.created_at, av.deleted
     FROM app_versions av
     WHERE av.id = $1`,
    [appVersionId],
  )
  if (res.rows.length === 0) {
    console.error(`app_version_id ${appVersionId} not found`)
    process.exit(1)
  }
  return res.rows[0]
}

// ── Check R2 file existence via HEAD ─────────────────────────────────────────

async function checkFileInR2(s3Path) {
  try {
    const stat = await s3.statObject(s3Path, {
      headers: { 'Accept-Encoding': 'identity' },
    })
    const size = Number.isFinite(stat.size) ? stat.size : 0
    return { exists: true, size, error: null }
  }
  catch (err) {
    const status = err?.statusCode ?? err?.status ?? null
    if (status === 404) {
      return { exists: false, size: 0, error: 'NOT_FOUND' }
    }
    return { exists: false, size: 0, error: `${err.message || err}` }
  }
}

// ── Run checks with bounded concurrency ──────────────────────────────────────

async function checkAllFiles(entries) {
  const total = entries.length
  const results = new Array(total)
  let cursor = 0
  let done = 0
  let missingCount = 0
  const isTTY = process.stderr.isTTY

  function printProgress() {
    const pct = ((done / total) * 100).toFixed(1)
    const msg = `  Checking: ${done}/${total} (${pct}%) — ${missingCount} missing so far`
    if (isTTY) {
      process.stderr.write(`\r${msg}`)
    }
    else if (done % 200 === 0 || done === total) {
      console.log(msg)
    }
  }

  async function worker() {
    while (cursor < entries.length) {
      const idx = cursor++
      const entry = entries[idx]
      const r2Result = await checkFileInR2(entry.s3_path)
      results[idx] = {
        ...entry,
        r2_exists: r2Result.exists,
        r2_size: r2Result.size,
        r2_error: r2Result.error,
        size_mismatch: r2Result.exists && entry.file_size > 0 && r2Result.size !== entry.file_size,
      }
      if (!r2Result.exists) missingCount++
      done++
      printProgress()
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () => worker())
  await Promise.all(workers)
  if (isTTY) process.stderr.write('\n')
  return results
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/bundle-health.mjs <app_version_id>')
    console.log('       node scripts/bundle-health.mjs <app_id> <version_name>')
    process.exit(0)
  }

  const appVersionId = await resolveAppVersionId(args)

  // 1. Bundle metadata
  const meta = await fetchBundleMeta(appVersionId)
  console.log('\n── Bundle Metadata ──────────────────────────────────────')
  console.log(`  ID:             ${meta.id}`)
  console.log(`  App:            ${meta.app_id}`)
  console.log(`  Version:        ${meta.name}`)
  console.log(`  R2 path:        ${meta.r2_path ?? '(none)'}`)
  console.log(`  Checksum:       ${meta.checksum ?? '(none)'}`)
  console.log(`  Manifest count: ${meta.manifest_count ?? 0}`)
  console.log(`  Created:        ${meta.created_at}`)
  console.log(`  Deleted:        ${meta.deleted}`)

  // 2. Check full bundle zip in R2
  if (meta.r2_path) {
    console.log('\n── Bundle Zip ──────────────────────────────────────────')
    const zipResult = await checkFileInR2(meta.r2_path)
    if (zipResult.exists) {
      console.log(`  Zip exists:     YES (${(zipResult.size / 1024).toFixed(1)} KB)`)
    }
    else {
      console.log(`  Zip exists:     NO  (${zipResult.error})`)
    }
  }

  // 3. Fetch manifest entries
  const entries = await fetchManifest(appVersionId)
  if (entries.length === 0) {
    console.log('\n  No manifest entries found. This bundle uses zip-only delivery.')
    await pool.end()
    return
  }

  console.log(`\n── Manifest Health Check (${entries.length} files) ─────────────────`)

  // 4. Check all files in R2
  const startMs = Date.now()
  const results = await checkAllFiles(entries)
  const elapsedMs = Date.now() - startMs

  // 5. Classify results
  const missing = results.filter(r => !r.r2_exists)
  const sizeMismatch = results.filter(r => r.size_mismatch)
  const zeroSizeDb = results.filter(r => r.file_size === 0 || r.file_size === null)
  const healthy = results.filter(r => r.r2_exists && !r.size_mismatch)

  // 6. Report
  console.log(`  Checked ${results.length} files in ${(elapsedMs / 1000).toFixed(1)}s`)
  console.log(`  Healthy:        ${healthy.length}`)
  console.log(`  Missing in R2:  ${missing.length}`)
  console.log(`  Size mismatch:  ${sizeMismatch.length}`)
  console.log(`  DB size = 0:    ${zeroSizeDb.length} (trigger may not have run yet)`)

  if (missing.length > 0) {
    console.log('\n── MISSING FILES (would cause download_manifest_file_fail) ──')
    for (const f of missing) {
      console.log(`  ✗ ${f.file_name}`)
      console.log(`    s3_path:   ${f.s3_path}`)
      console.log(`    file_hash: ${f.file_hash}`)
      console.log(`    error:     ${f.r2_error}`)
    }
  }

  if (sizeMismatch.length > 0) {
    console.log('\n── SIZE MISMATCHES (may cause download_manifest_checksum_fail) ──')
    for (const f of sizeMismatch) {
      console.log(`  ! ${f.file_name}`)
      console.log(`    s3_path:  ${f.s3_path}`)
      console.log(`    DB size:  ${f.file_size} bytes`)
      console.log(`    R2 size:  ${f.r2_size} bytes`)
    }
  }

  // 7. Write CSV of missing files
  if (missing.length > 0) {
    const csvName = `bundle-health-${meta.app_id}-${meta.name.replace(/[^a-zA-Z0-9._+-]/g, '_')}.csv`
    const csvPath = resolve(__dirname, csvName)
    const header = 'file_name,file_hash,s3_path,db_file_size,error'
    const rows = missing.map(f =>
      [f.file_name, f.file_hash, f.s3_path, f.file_size ?? 0, f.r2_error]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
    writeFileSync(csvPath, [header, ...rows].join('\n') + '\n')
    console.log(`\n  CSV written: ${csvPath}`)
  }

  // 8. Summary verdict
  console.log('\n── Verdict ─────────────────────────────────────────────')
  if (missing.length === 0 && sizeMismatch.length === 0) {
    console.log('  ✓ HEALTHY — all manifest files exist in R2')
  }
  else if (missing.length > 0) {
    console.log(`  ✗ UNHEALTHY — ${missing.length}/${results.length} files missing in R2`)
    console.log('    Devices downloading this bundle via manifest will hit download_manifest_file_fail')
  }
  else {
    console.log(`  ! WARNING — ${sizeMismatch.length} files have size mismatches`)
    console.log('    May cause download_manifest_checksum_fail on devices')
  }
  console.log()

  await pool.end()
  process.exit(missing.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(2)
})
