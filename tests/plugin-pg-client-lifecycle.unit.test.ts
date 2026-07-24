import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getRuntimeKeyMock, PoolMock, poolOnMock } = vi.hoisted(() => {
  const poolOnMock = vi.fn()
  const PoolMock = vi.fn(function PoolMock(this: { on: typeof poolOnMock, end: ReturnType<typeof vi.fn> }) {
    this.on = poolOnMock
    this.end = vi.fn(async () => undefined)
    return this
  })
  return {
    getRuntimeKeyMock: vi.fn(() => 'workerd'),
    PoolMock,
    poolOnMock,
  }
})

vi.mock('hono/adapter', () => ({
  getRuntimeKey: getRuntimeKeyMock,
}))

vi.mock('pg', () => ({
  Pool: PoolMock,
}))

vi.mock('../supabase/functions/_backend/plugin_runtime/utils/logging.ts', () => ({
  cloudlog: vi.fn(),
  cloudlogErr: vi.fn(),
  serializeError: vi.fn(error => error),
}))

vi.mock('../supabase/functions/_backend/plugin_runtime/utils/utils.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../supabase/functions/_backend/plugin_runtime/utils/utils.ts')>()
  return {
    ...actual,
    backgroundTask: vi.fn((_c, p) => p),
    getEnv: vi.fn((_c, key: string) => {
      if (key === 'ENV_NAME')
        return 'capgo_plugin-eu-prod-test'
      if (key === 'SB_REGION')
        return 'eu-west-3'
      if (key === 'SUPABASE_DB_URL')
        return 'postgres://supabase-direct'
      if (key === 'MAIN_SUPABASE_DB_URL')
        return 'postgres://main-pooler'
      return ''
    }),
    existInEnv: vi.fn((_c, key: string) => key === 'ENV_NAME' || key === 'SB_REGION' || key === 'MAIN_SUPABASE_DB_URL'),
  }
})

function createContext(env: Record<string, any> = {}) {
  return {
    env: {
      HYPERDRIVE_CAPGO_READ_EU: { connectionString: 'postgres://hyperdrive-eu' },
      ...env,
    },
    get: (key: string) => {
      if (key === 'requestId')
        return 'request-id'
      if (key === 'requireReadReplica')
        return true
      if (key === 'skipSupabaseStatsFallback')
        return true
      if (key === 'skipSupabaseNotificationWrites')
        return true
      if (key === 'queuePluginNotifications')
        return true
      if (key === 'skipChannelSelfPostgresFallback')
        return true
      return undefined
    },
    set: vi.fn(),
    req: {
      raw: {
        cf: { continent: 'EU' },
        headers: new Headers(),
      },
      url: 'http://localhost/updates',
      header: () => undefined,
    },
    res: {
      headers: new Headers([['X-Worker-Source', 'plugin']]),
    },
  } as any
}

describe('plugin_runtime workerd pg per-request lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    PoolMock.mockClear()
    poolOnMock.mockClear()
    getRuntimeKeyMock.mockReturnValue('workerd')
  })

  it('creates a fresh max:1 Pool per request on workerd and ends it on close', async () => {
    const { getPgClient, closeClient } = await import('../supabase/functions/_backend/plugin_runtime/utils/pg.ts')
    const c = createContext()

    const first = getPgClient(c, true)
    const second = getPgClient(c, true)

    expect(first).not.toBe(second)
    expect(PoolMock).toHaveBeenCalledTimes(2)
    expect(PoolMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ max: 1 }))

    await closeClient(c, first)
    expect(first.end).toHaveBeenCalledTimes(1)
  })

  it('still creates a fresh Pool outside workerd and ends it on close', async () => {
    getRuntimeKeyMock.mockReturnValue('node')
    const { getPgClient, closeClient } = await import('../supabase/functions/_backend/plugin_runtime/utils/pg.ts')
    const c = createContext()

    const first = getPgClient(c, true)
    const second = getPgClient(c, true)

    expect(first).not.toBe(second)
    expect(PoolMock).toHaveBeenCalledTimes(2)
    expect(PoolMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ max: 4 }))

    await closeClient(c, first)
    expect(first.end).toHaveBeenCalledTimes(1)
  })

  it('logs when end fails instead of throwing into the request path', async () => {
    const { cloudlogErr } = await import('../supabase/functions/_backend/plugin_runtime/utils/logging.ts')
    PoolMock.mockImplementation(function PoolMock(this: { on: typeof poolOnMock, end: ReturnType<typeof vi.fn> }) {
      this.on = poolOnMock
      this.end = vi.fn(async () => {
        throw new Error('end unsupported')
      })
      return this
    })

    const { getPgClient, closeClient } = await import('../supabase/functions/_backend/plugin_runtime/utils/pg.ts')
    const c = createContext()
    const client = getPgClient(c, true)

    await expect(closeClient(c, client)).resolves.toBeUndefined()
    expect(cloudlogErr).toHaveBeenCalledWith(expect.objectContaining({
      message: 'PG client end failed',
    }))
  })
})
