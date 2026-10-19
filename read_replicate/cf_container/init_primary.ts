#!/usr/bin/env bun
/**
 * Create the main (primary) Postgres node of the Cloudflare Containers cluster.
 *
 *   bun read_replicate/cf_container/init_primary.ts [--env preprod|prod] [--location weur] [--no-serve] [--skip-size-check] [--no-wait]
 *
 * --env defaults to preprod (reads internal/cloudflare/.env.preprod). In
 * preprod the script creates the source publication if it is missing; in prod
 * it reuses capgo_google_eu_2_pub and never touches the publication.
 *
 * 1. Checks the replicated tables fit the 20 GB container disk.
 * 2. Creates the R2 bucket that holds base backups + WAL (WAL-G).
 * 3. Deploys the control Worker + container image and sets its secrets.
 * 4. Creates a tunnel + Workers VPC service for the node (unless --no-serve).
 * 5. Registers + starts the primary. Fresh R2 prefix: initdb, schema,
 *    subscription to Supabase (copy_data=true), first base backup.
 *    Existing backup in R2: restore + replay WAL + resume the subscription.
 * 6. Creates the Hyperdrive config pointing at the node.
 *
 * Re-running is safe: secrets and resources are reused from .cluster-state.json.
 *
 * Env (shell or internal/cloudflare/.env.<env>): CLOUDFLARE_API_TOKEN,
 * CLOUDFLARE_ACCOUNT_ID, MAIN_SUPABASE_DB_URL, PG_CF_R2_ACCESS_KEY_ID,
 * PG_CF_R2_SECRET_ACCESS_KEY (R2 S3 API token scoped to the WAL bucket).
 */
import { copyFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ClusterState, LocationHint } from './lib.ts'
import {
  admin,
  CLUSTER_ENV,
  DIR,
  env,
  fail,
  LOCATION_HINTS,
  loadState,
  log,
  parseArgs,
  provisionHyperdrive,
  provisionTunnel,
  PUBLICATION_NAME,
  randomSecret,
  REPLICA_TABLES,
  REPO_ROOT,
  run,
  saveState,
  sourceConninfo,
  sourcePassword,
  WAL_BUCKET,
  waitForNode,
  wrangler,
  wranglerWorker,
} from './lib.ts'

// Leave room on the 20 GB disk for WAL, temp files and the image itself.
const MAX_DB_BYTES = 14 * 1024 ** 3

const { flags } = parseArgs(process.argv.slice(2))
const location = String(flags.location ?? 'weur') as LocationHint
if (!LOCATION_HINTS.includes(location))
  fail(`--location must be one of ${LOCATION_HINTS.join(', ')}`)
const serve = !flags['no-serve']

const account = env('CLOUDFLARE_ACCOUNT_ID')
env('CLOUDFLARE_API_TOKEN')
const r2KeyId = env('PG_CF_R2_ACCESS_KEY_ID')
const r2Secret = env('PG_CF_R2_SECRET_ACCESS_KEY')
const r2Endpoint = `https://${account}.r2.cloudflarestorage.com`
const conninfo = sourceConninfo()
const psql = Bun.which('psql-17') ?? Bun.which('psql') ?? fail('psql not found')
// Password goes through PGPASSWORD so it never appears in argv or error output.
const psqlConninfo = sourceConninfo({ withPassword: false })
const sourceSql = async (sql: string) => (await run([psql, psqlConninfo, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
  quiet: true,
  env: { PGPASSWORD: sourcePassword() },
})).stdout.trim()

log(`env=${CLUSTER_ENV} publication=${PUBLICATION_NAME} bucket=${WAL_BUCKET}`)
const hasPublication = await sourceSql(`SELECT count(*) FROM pg_publication WHERE pubname = '${PUBLICATION_NAME}'`)
if (hasPublication === '0') {
  if (CLUSTER_ENV === 'prod')
    fail(`publication ${PUBLICATION_NAME} missing on the prod source`)
  log(`creating publication ${PUBLICATION_NAME} on the preprod source`)
  await sourceSql(`CREATE PUBLICATION ${PUBLICATION_NAME} FOR TABLE ${REPLICA_TABLES.map(t => `public.${t}`).join(', ')}`)
}

log(`ensuring R2 bucket ${WAL_BUCKET}`)
const bucket = await wrangler(['r2', 'bucket', 'create', WAL_BUCKET], { allowFail: true, quiet: true })
if (bucket.code !== 0 && !/already exists/i.test(bucket.stderr + bucket.stdout))
  fail(`r2 bucket create failed:\n${bucket.stderr || bucket.stdout}`)

log('checking R2 key can read/write the WAL bucket')
const r2 = new Bun.S3Client({ accessKeyId: r2KeyId, secretAccessKey: r2Secret, endpoint: r2Endpoint, bucket: WAL_BUCKET, region: 'auto' })
try {
  await r2.write('preflight.txt', 'ok')
  await r2.delete('preflight.txt')
}
catch (error) {
  fail(`PG_CF_R2_ACCESS_KEY_ID cannot write ${WAL_BUCKET} (${error}). Create an R2 token with Object Read & Write on that bucket.`)
}

if (!flags['skip-size-check']) {
  log('measuring replicated tables on Supabase')
  const tables = REPLICA_TABLES.map(t => `'public.${t}'`).join(',')
  const bytes = Number(await sourceSql(`SELECT coalesce(sum(pg_total_relation_size(t::regclass)), 0) FROM unnest(ARRAY[${tables}]) t`))
  const gb = (bytes / 1024 ** 3).toFixed(1)
  if (bytes > MAX_DB_BYTES)
    fail(`replicated tables are ${gb} GB; containers have 20 GB ephemeral disk (max ~14 GB data). Shrink the publication or keep Cloud SQL.`)
  log(`replicated tables: ${gb} GB (limit ${(MAX_DB_BYTES / 1024 ** 3).toFixed(0)} GB)`)
}

const state: ClusterState = loadState() ?? {
  adminToken: randomSecret(),
  postgresPassword: randomSecret(24),
  readerPassword: randomSecret(24),
  nodes: {},
}
saveState(state)

log('bundling schema_replicate.sql into the image')
copyFileSync(join(REPO_ROOT, 'read_replicate/schema_replicate.sql'), join(DIR, 'container/schema.sql'))

log('deploying control worker + container image (needs Docker running)')
const deploy = await wranglerWorker(['deploy'], { quiet: true })
const workerUrl = deploy.stdout.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0]
if (workerUrl)
  state.workerUrl = workerUrl
if (!state.workerUrl && !process.env.PG_CLUSTER_URL)
  fail(`could not find workers.dev URL in deploy output, set PG_CLUSTER_URL:\n${deploy.stdout}`)
saveState(state)

log('setting worker secrets')
const secretsFile = join(DIR, '.secrets.tmp.json')
writeFileSync(secretsFile, JSON.stringify({
  ADMIN_TOKEN: state.adminToken,
  R2_ENDPOINT: r2Endpoint,
  R2_ACCESS_KEY_ID: r2KeyId,
  R2_SECRET_ACCESS_KEY: r2Secret,
  POSTGRES_PASSWORD: state.postgresPassword,
  READER_PASSWORD: state.readerPassword,
  SOURCE_CONNINFO: conninfo,
}), { mode: 0o600 })
try {
  await wranglerWorker(['secret', 'bulk', secretsFile], { quiet: true })
}
finally {
  rmSync(secretsFile, { force: true })
}

const tunnel = serve ? await provisionTunnel(state, 'primary', location) : undefined

log(`starting primary in ${location}`)
await admin(state, 'PUT', '/nodes/primary', { role: 'primary', locationHint: location, tunnelToken: tunnel?.tunnelToken })

if (flags['no-wait']) {
  log(`not waiting; check progress with: bun run pgcf:status --env ${CLUSTER_ENV}`)
  process.exit(0)
}

log('waiting for primary (initial copy from Supabase or restore from R2 can take a while)')
await waitForNode(state, 'primary', h => h.node?.phase === 'running' && h.node.postgres?.in_recovery === false)

const hyperdriveId = serve ? await provisionHyperdrive(state, 'primary') : undefined
log('primary ready')
console.log(`    worker:     ${state.workerUrl}`)
if (hyperdriveId)
  console.log(`    hyperdrive: ${hyperdriveId}  (bind it in the plugin worker for ${location})`)
console.log(`    add a region: bun run pgcf:add-region <name> --location <hint> --env ${CLUSTER_ENV}`)
