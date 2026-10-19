// Shared helpers for the Cloudflare Containers Postgres cluster scripts.
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DIR = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(DIR, '../..')

// --env preprod (default) | prod. Preprod is the test bed; prod must be explicit.
const envFlagIndex = process.argv.findIndex(a => a === '--env' || a.startsWith('--env='))
const envFlag = envFlagIndex === -1
  ? 'preprod'
  : process.argv[envFlagIndex].includes('=') ? process.argv[envFlagIndex].split('=')[1] : process.argv[envFlagIndex + 1]
if (envFlag !== 'preprod' && envFlag !== 'prod') {
  console.error('Error: --env must be preprod or prod')
  process.exit(1)
}
export const CLUSTER_ENV: 'preprod' | 'prod' = envFlag
const ENV_FILE = process.env.REPLICA_ENV_FILE ?? join(REPO_ROOT, `internal/cloudflare/.env.${CLUSTER_ENV}`)
const STATE_FILE = join(DIR, `.cluster-state.${CLUSTER_ENV}.json`)
/** Must match vars in wrangler.jsonc for the selected env. */
export const WAL_BUCKET = CLUSTER_ENV === 'prod' ? 'capgo-pg-wal' : 'capgo-pg-wal-preprod'
export const PUBLICATION_NAME = CLUSTER_ENV === 'prod' ? 'capgo_google_eu_2_pub' : 'capgo_cf_preprod_pub'

export const LOCATION_HINTS = ['wnam', 'enam', 'sam', 'weur', 'eeur', 'apac', 'oc', 'afr', 'me'] as const
export type LocationHint = typeof LOCATION_HINTS[number]

// Tables published to the read replica (keep in sync with read_replicate/common.sh).
export const REPLICA_TABLES = [
  'orgs',
  'stripe_info',
  'org_users',
  'apps',
  'app_versions',
  'channels',
  'channel_devices',
  'manifest',
  'notifications',
  'onboarding_demo_data',
]

export interface NodeState {
  locationHint: LocationHint
  tunnelId: string
  tunnelToken: string
  vpcServiceId: string
  hyperdriveId?: string
}

export interface ClusterState {
  workerUrl?: string
  adminToken: string
  postgresPassword: string
  readerPassword: string
  nodes: Record<string, NodeState>
}

export function log(msg: string) {
  console.log(`==> ${msg}`)
}

export function fail(msg: string): never {
  console.error(`Error: ${msg}`)
  process.exit(1)
}

let envCache: Record<string, string> | undefined
export function env(key: string, required = true): string {
  if (!envCache) {
    envCache = {}
    if (existsSync(ENV_FILE)) {
      for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m)
          envCache[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
      }
    }
  }
  let value: string | undefined = process.env[key] ?? envCache[key]
  // Account id falls back to the R2 endpoint host (<account>.r2.cloudflarestorage.com).
  if (!value && key === 'CLOUDFLARE_ACCOUNT_ID')
    value = (process.env.S3_ENDPOINT ?? envCache.S3_ENDPOINT ?? '').match(/([0-9a-f]{32})\.r2\.cloudflarestorage\.com/)?.[1]
  // API token falls back to the logged-in wrangler OAuth session.
  if (!value && key === 'CLOUDFLARE_API_TOKEN') {
    const out = Bun.spawnSync(['bunx', 'wrangler', 'auth', 'token'], { stderr: 'ignore' }).stdout.toString().trim().split('\n').at(-1)
    value = out && /^[\w.-]{20,}$/.test(out) ? out : undefined
  }
  if (value)
    envCache[key] = value
  if (!value && required)
    fail(`${key} is not set (env or ${ENV_FILE})`)
  return value ?? ''
}

export function randomSecret(bytes = 32) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url')
}

export function loadState(): ClusterState | undefined {
  if (!existsSync(STATE_FILE))
    return undefined
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
}

export function saveState(state: ClusterState) {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`)
  chmodSync(STATE_FILE, 0o600)
}

export async function run(cmd: string[], opts: { input?: string, allowFail?: boolean, quiet?: boolean, env?: Record<string, string> } = {}) {
  const proc = Bun.spawn(cmd, {
    cwd: DIR,
    // wrangler needs the account when the login has several.
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: env('CLOUDFLARE_ACCOUNT_ID', false) || undefined, ...opts.env },
    stdin: opts.input !== undefined ? new TextEncoder().encode(opts.input) : 'inherit',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0 && !opts.allowFail)
    fail(`${cmd.slice(0, 4).join(' ')} failed (exit ${code}):\n${stderr || stdout}`)
  if (!opts.quiet && stdout.trim())
    console.log(stdout.trim())
  return { stdout, stderr, code }
}

export function wrangler(args: string[], opts: { input?: string, allowFail?: boolean, quiet?: boolean } = {}) {
  return run(['bunx', 'wrangler', ...args], opts)
}

/** wrangler commands that target the control Worker (deploy, secrets). */
export function wranglerWorker(args: string[], opts: { input?: string, allowFail?: boolean, quiet?: boolean } = {}) {
  return wrangler(CLUSTER_ENV === 'prod' ? args : [...args, '--env', CLUSTER_ENV], opts)
}

function uuidFrom(text: string) {
  return text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]
}

async function cfApiRaw<T>(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      'authorization': `Bearer ${env('CLOUDFLARE_API_TOKEN')}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  })
  return await res.json() as { success: boolean, result: T, errors: unknown[] }
}

export async function cfApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const body = await cfApiRaw<T>(path, init)
  if (!body.success)
    fail(`Cloudflare API ${init.method ?? 'GET'} ${path}: ${JSON.stringify(body.errors)}`)
  return body.result
}

/**
 * Supabase pooler URL -> direct libpq key/value conninfo for logical
 * replication (same conversion as read_replicate/common.sh).
 */
export function sourceConninfo(opts: { withPassword?: boolean } = {}): string {
  const url = new URL(env('MAIN_SUPABASE_DB_URL'))
  let user = decodeURIComponent(url.username)
  let host = url.hostname
  let port = url.port || '5432'
  if (user.startsWith('postgres.')) {
    host = `db.${user.slice('postgres.'.length)}.supabase.co`
    user = 'postgres'
    port = '5432'
  }
  else if (port === '6543') {
    port = '5432'
  }
  const q = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`
  return [
    `host=${q(host)}`,
    `port=${q(port)}`,
    `dbname=${q(url.pathname.slice(1) || 'postgres')}`,
    `user=${q(user)}`,
    ...(opts.withPassword === false ? [] : [`password=${q(decodeURIComponent(url.password))}`]),
    'sslmode=require',
    'connect_timeout=10',
    'keepalives=1',
    'keepalives_idle=10',
    'keepalives_interval=5',
    'keepalives_count=3',
  ].join(' ')
}

/** Supabase password for local psql via PGPASSWORD (never on the command line). */
export function sourcePassword(): string {
  return decodeURIComponent(new URL(env('MAIN_SUPABASE_DB_URL')).password)
}

/** Tunnel (cloudflared runs inside the container) -> Workers VPC service. */
export async function provisionTunnel(state: ClusterState, name: string, locationHint: LocationHint): Promise<NodeState> {
  const existing = state.nodes[name]
  if (existing?.vpcServiceId) {
    log(`tunnel for ${name} already provisioned (${existing.tunnelId})`)
    return existing
  }
  const account = env('CLOUDFLARE_ACCOUNT_ID')
  const resourceName = `capgo-pg-${CLUSTER_ENV}-${name}`

  log(`creating tunnel ${resourceName}`)
  const found = await cfApi<{ id: string }[]>(`/accounts/${account}/cfd_tunnel?name=${resourceName}&is_deleted=false`)
  const tunnelId = found[0]?.id ?? (await cfApi<{ id: string }>(`/accounts/${account}/cfd_tunnel`, {
    method: 'POST',
    body: JSON.stringify({ name: resourceName, config_src: 'cloudflare' }),
  })).id
  const tunnelToken = await cfApi<string>(`/accounts/${account}/cfd_tunnel/${tunnelId}/token`)

  log(`creating Workers VPC service ${resourceName}`)
  const vpc = await wrangler([
    'vpc',
    'service',
    'create',
    resourceName,
    '--type',
    'tcp',
    '--tunnel-id',
    tunnelId,
    '--tcp-port',
    '5432',
    '--app-protocol',
    'postgresql',
    '--ipv4',
    '127.0.0.1',
  ], { quiet: true })
  const vpcServiceId = uuidFrom(vpc.stdout.replace(tunnelId, '')) ?? fail(`cannot parse VPC service id:\n${vpc.stdout}`)

  const node: NodeState = { locationHint, tunnelId, tunnelToken, vpcServiceId }
  state.nodes[name] = node
  saveState(state)
  return node
}

/**
 * Hyperdrive validates the origin on create, so call this once the node is
 * running and capgo_reader exists.
 */
export async function provisionHyperdrive(state: ClusterState, name: string): Promise<string> {
  const node = state.nodes[name] ?? fail(`no tunnel state for ${name}`)
  if (node.hyperdriveId)
    return node.hyperdriveId
  const resourceName = `capgo-pg-${CLUSTER_ENV}-${name}`
  const vpcServiceId = node.vpcServiceId
  log(`creating Hyperdrive ${resourceName} (cache max-age 60s, swr 15s like the Google replicas)`)
  // REST API instead of `wrangler hyperdrive create --password`: the reader
  // password stays in the request body, never in argv or command output.
  const account = env('CLOUDFLARE_ACCOUNT_ID')
  const createBody = JSON.stringify({
    name: resourceName,
    origin: {
      service_id: vpcServiceId,
      scheme: 'postgres',
      database: 'postgres',
      user: 'capgo_reader',
      password: state.readerPassword,
    },
    caching: { max_age: 60, stale_while_revalidate: 15 },
  })
  let hyperdriveId: string | undefined
  // The tunnel connector comes up a few seconds after Postgres; retry.
  for (let attempt = 0; attempt <= 10 && !hyperdriveId; attempt++) {
    const res = await cfApiRaw<{ id: string }>(`/accounts/${account}/hyperdrive/configs`, { method: 'POST', body: createBody })
    if (res.success) {
      hyperdriveId = res.result.id
      break
    }
    const reason = JSON.stringify(res.errors)
    if (attempt === 10)
      fail(`hyperdrive create failed: ${reason}`)
    console.log(`    hyperdrive create failed, retrying in 15s: ${reason}`)
    await Bun.sleep(15_000)
  }
  if (!hyperdriveId)
    fail('hyperdrive create returned no id')
  node.hyperdriveId = hyperdriveId
  saveState(state)
  return hyperdriveId
}

export async function deprovisionNodeNetwork(state: ClusterState, name: string) {
  const node = state.nodes[name]
  if (!node)
    return
  const account = env('CLOUDFLARE_ACCOUNT_ID')
  if (node.hyperdriveId)
    await cfApiRaw(`/accounts/${account}/hyperdrive/configs/${node.hyperdriveId}`, { method: 'DELETE' })
  await wrangler(['vpc', 'service', 'delete', node.vpcServiceId], { allowFail: true, input: 'y\n' })
  await cfApi(`/accounts/${account}/cfd_tunnel/${node.tunnelId}`, { method: 'DELETE' }).catch(() => {})
  delete state.nodes[name]
  saveState(state)
}

export function clusterUrl(state: ClusterState) {
  return process.env.PG_CLUSTER_URL ?? state.workerUrl ?? fail('worker URL unknown, run init_primary.ts first or set PG_CLUSTER_URL')
}

export async function admin<T>(state: ClusterState, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${clusterUrl(state)}${path}`, {
    method,
    headers: { 'authorization': `Bearer ${state.adminToken}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok)
    fail(`${method} ${path} -> ${res.status}: ${text}`)
  return JSON.parse(text) as T
}

interface NodeHealth {
  name: string
  container: { status: string }
  node?: { phase?: string, disk?: string, postgres?: { in_recovery?: boolean, replay_lag_s?: number | null, tables_not_ready?: number } | null }
}

/** Poll a node until `done` returns true. Restores of a large DB take minutes. */
export async function waitForNode(state: ClusterState, name: string, done: (h: NodeHealth) => boolean, timeoutMin = 240) {
  const deadline = Date.now() + timeoutMin * 60_000
  let last = ''
  while (Date.now() < deadline) {
    const h = await admin<NodeHealth>(state, 'GET', `/nodes/${name}`)
    const pg = h.node?.postgres
    const line = `[${name}] container=${h.container.status} phase=${h.node?.phase ?? '-'} disk=${h.node?.disk ?? '-'}`
      + (pg ? ` recovery=${pg.in_recovery} lag=${pg.replay_lag_s ?? '-'}s tables_not_ready=${pg.tables_not_ready ?? '-'}` : '')
    if (line !== last) {
      console.log(`    ${new Date().toISOString()} ${line}`)
      last = line
    }
    if (done(h))
      return h
    await Bun.sleep(15_000)
  }
  fail(`${name} not ready after ${timeoutMin} minutes`)
}

export function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2)
      if (v !== undefined)
        flags[k] = v
      else if (argv[i + 1] && !argv[i + 1].startsWith('--'))
        flags[k] = argv[++i]
      else
        flags[k] = true
    }
    else {
      positional.push(a)
    }
  }
  return { flags, positional }
}
