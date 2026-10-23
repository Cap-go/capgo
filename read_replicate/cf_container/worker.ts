/**
 * Control plane for the Capgo Postgres read-replica cluster on Cloudflare
 * Containers. Each node (one primary + N regional replicas) is a PgNode
 * Durable Object owning exactly one container. The node list lives in R2 next
 * to the WAL archive; a cron restarts any node whose container stopped.
 *
 * Admin API (Authorization: Bearer ADMIN_TOKEN):
 *   GET    /nodes                 registry + live health of every node
 *   PUT    /nodes/:name           register/update + start { role, locationHint, tunnelToken? }
 *   POST   /nodes/:name/restart   stop + start the container (fresh restore from R2)
 *   DELETE /nodes/:name           stop the container and unregister it
 */
import { Container } from '@cloudflare/containers'

type Role = 'primary' | 'replica'
type LocationHint = 'wnam' | 'enam' | 'sam' | 'weur' | 'eeur' | 'apac' | 'oc' | 'afr' | 'me'

interface NodeConfig {
  name: string
  role: Role
  locationHint: LocationHint
  tunnelToken?: string
}

interface Env {
  PG_NODE: DurableObjectNamespace<PgNode>
  WAL: R2Bucket
  ADMIN_TOKEN: string
  CLUSTER: string
  WAL_BUCKET: string
  R2_ENDPOINT: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  POSTGRES_PASSWORD: string
  READER_PASSWORD: string
  SOURCE_CONNINFO: string
  PUBLICATION_NAME: string
  SUBSCRIPTION_NAME: string
  ARCHIVE_TIMEOUT?: string
  BACKUP_INTERVAL_HOURS?: string
}

const LOCATION_HINTS = new Set<LocationHint>(['wnam', 'enam', 'sam', 'weur', 'eeur', 'apac', 'oc', 'afr', 'me'])
const NAME_RE = /^[a-z][a-z0-9-]{1,30}$/

function containerEnv(env: Env, cfg: NodeConfig): Record<string, string> {
  const vars: Record<string, string> = {
    ROLE: cfg.role,
    NODE_NAME: cfg.name,
    WALG_S3_PREFIX: `s3://${env.WAL_BUCKET}/${env.CLUSTER}`,
    AWS_ENDPOINT: env.R2_ENDPOINT,
    AWS_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    POSTGRES_PASSWORD: env.POSTGRES_PASSWORD,
    READER_PASSWORD: env.READER_PASSWORD,
    ARCHIVE_TIMEOUT: env.ARCHIVE_TIMEOUT ?? '30',
    BACKUP_INTERVAL_HOURS: env.BACKUP_INTERVAL_HOURS ?? '24',
  }
  if (cfg.role === 'primary') {
    vars.SOURCE_CONNINFO = env.SOURCE_CONNINFO
    vars.PUBLICATION_NAME = env.PUBLICATION_NAME
    vars.SUBSCRIPTION_NAME = env.SUBSCRIPTION_NAME
  }
  if (cfg.tunnelToken)
    vars.TUNNEL_TOKEN = cfg.tunnelToken
  return vars
}

export class PgNode extends Container<Env> {
  defaultPort = 8080
  // Postgres must never idle out: the cron renews activity every minute and
  // onActivityExpired refuses to stop the container.
  sleepAfter = '1h'

  override async onActivityExpired(): Promise<void> {
    this.renewActivityTimeout()
  }

  override onStop(params: { exitCode: number, reason: string }): void {
    console.log(`container stopped exitCode=${params.exitCode} reason=${params.reason}`)
  }

  override onError(error: unknown): void {
    console.error('container error', error)
  }

  async configure(cfg: NodeConfig): Promise<unknown> {
    const previous = await this.ctx.storage.get<NodeConfig>('config')
    await this.ctx.storage.put('config', cfg)
    // Role or tunnel changes only apply on a fresh start.
    if (previous && (previous.role !== cfg.role || previous.tunnelToken !== cfg.tunnelToken))
      await this.restart()
    return this.ensureRunning()
  }

  async ensureRunning(): Promise<{ name?: string, status: string }> {
    const cfg = await this.ctx.storage.get<NodeConfig>('config')
    if (!cfg)
      return { status: 'unconfigured' }
    const state = await this.getState()
    if (state.status === 'running' || state.status === 'healthy') {
      this.renewActivityTimeout()
      return { name: cfg.name, status: state.status }
    }
    await this.start({ envVars: containerEnv(this.env, cfg), enableInternet: true })
    return { name: cfg.name, status: 'starting' }
  }

  async restart(): Promise<void> {
    const state = await this.getState()
    if (state.status === 'running' || state.status === 'healthy') {
      await this.stop('SIGTERM')
      for (let i = 0; i < 120; i++) {
        const s = await this.getState()
        if (s.status !== 'running' && s.status !== 'healthy' && s.status !== 'stopping')
          break
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }

  async health(): Promise<unknown> {
    const cfg = await this.ctx.storage.get<NodeConfig>('config')
    const state = await this.getState()
    const base = { name: cfg?.name, role: cfg?.role, locationHint: cfg?.locationHint, container: state }
    if (state.status !== 'running' && state.status !== 'healthy')
      return base
    try {
      // Loopback from the Durable Object to its own container port; never leaves the host.
      const res = await this.containerFetch('http://container/health', {}, 8080) // NOSONAR
      return { ...base, node: await res.json() }
    }
    catch (error) {
      return { ...base, node: { error: String(error) } }
    }
  }

  async remove(): Promise<void> {
    await this.restart()
    await this.ctx.storage.deleteAll()
  }
}

function registryKey(env: Env) {
  return `${env.CLUSTER}/registry.json`
}

async function readRegistry(env: Env): Promise<Record<string, Omit<NodeConfig, 'tunnelToken'>>> {
  const obj = await env.WAL.get(registryKey(env))
  return obj ? await obj.json() : {}
}

async function writeRegistry(env: Env, registry: Record<string, Omit<NodeConfig, 'tunnelToken'>>) {
  await env.WAL.put(registryKey(env), JSON.stringify(registry, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  })
}

function nodeStub(env: Env, name: string, locationHint?: LocationHint) {
  const id = env.PG_NODE.idFromName(name)
  return env.PG_NODE.get(id, locationHint ? { locationHint } : undefined)
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json' } })
}

async function timingSafeEqual(a: string, b: string) {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const va = new Uint8Array(ha)
  const vb = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < va.length; i++)
    diff |= va[i] ^ vb[i]
  return diff === 0
}

async function handle(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!env.ADMIN_TOKEN || !(await timingSafeEqual(token, env.ADMIN_TOKEN)))
    return json({ error: 'unauthorized' }, 401)

  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'nodes')
    return json({ error: 'not found' }, 404)

  if (parts.length === 1 && request.method === 'GET') {
    const registry = await readRegistry(env)
    const nodes = await Promise.all(Object.values(registry).map(n => nodeStub(env, n.name).health()))
    return json({ cluster: env.CLUSTER, nodes })
  }

  const name = parts[1] ?? ''
  if (!NAME_RE.test(name))
    return json({ error: 'invalid node name' }, 400)

  if (parts.length === 2 && request.method === 'PUT') {
    const body = await request.json<Partial<NodeConfig>>()
    if (body.role !== 'primary' && body.role !== 'replica')
      return json({ error: 'role must be primary or replica' }, 400)
    if (!body.locationHint || !LOCATION_HINTS.has(body.locationHint))
      return json({ error: `locationHint must be one of ${[...LOCATION_HINTS].join(', ')}` }, 400)
    const registry = await readRegistry(env)
    if (body.role === 'primary') {
      const other = Object.values(registry).find(n => n.role === 'primary' && n.name !== name)
      if (other)
        return json({ error: `primary already registered as ${other.name}` }, 409)
    }
    const cfg: NodeConfig = { name, role: body.role, locationHint: body.locationHint, tunnelToken: body.tunnelToken }
    registry[name] = { name, role: cfg.role, locationHint: cfg.locationHint }
    await writeRegistry(env, registry)
    const result = await nodeStub(env, name, cfg.locationHint).configure(cfg)
    return json(result)
  }

  if (parts.length === 3 && parts[2] === 'restart' && request.method === 'POST') {
    const stub = nodeStub(env, name)
    await stub.restart()
    return json(await stub.ensureRunning())
  }

  if (parts.length === 2 && request.method === 'GET')
    return json(await nodeStub(env, name).health())

  if (parts.length === 2 && request.method === 'DELETE') {
    const registry = await readRegistry(env)
    delete registry[name]
    await writeRegistry(env, registry)
    await nodeStub(env, name).remove()
    return json({ removed: name })
  }

  return json({ error: 'not found' }, 404)
}

export default {
  fetch: handle,
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const registry = await readRegistry(env)
    const results = await Promise.allSettled(Object.values(registry).map(n => nodeStub(env, n.name).ensureRunning()))
    results.forEach((r, i) => {
      if (r.status === 'rejected')
        console.error(`ensureRunning failed for ${Object.values(registry)[i]?.name}`, r.reason)
    })
  },
} satisfies ExportedHandler<Env>
