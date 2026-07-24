import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getRuntimeKeyMock, PoolMock, poolOnMock } = vi.hoisted(() => {
  const poolOnMock = vi.fn()
  const PoolMock = vi.fn(function PoolMock(this: { on: typeof poolOnMock }) {
    this.on = poolOnMock
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

describe('plugin_runtime workerd pg pool reuse', () => {
  beforeEach(() => {
    vi.resetModules()
    PoolMock.mockClear()
    poolOnMock.mockClear()
    getRuntimeKeyMock.mockReturnValue('workerd')
  })

  it('reuses one Pool per connection config on workerd and never ends it', async () => {
    const { getPgClient, closeClient } = await import('../supabase/functions/_backend/plugin_runtime/utils/pg.ts')
    const c = createContext()

    const first = getPgClient(c, true)
    const second = getPgClient(c, true)

    expect(first).toBe(second)
    expect(PoolMock).toHaveBeenCalledTimes(1)

    await closeClient(c, first)
    expect(first.end).toBeUndefined()
  })

  it('does not reuse workerd pools in local CF test mode', async () => {
    const endMock = vi.fn(async () => undefined)
    PoolMock.mockImplementation(function PoolMock(this: { on: typeof poolOnMock, end: typeof endMock }) {
      this.on = poolOnMock
      this.end = endMock
      return this
    })
    const utils = await import('../supabase/functions/_backend/plugin_runtime/utils/utils.ts')
    vi.mocked(utils.getEnv).mockImplementation((_c, key: string) => {
      if (key === 'CAPGO_PREVENT_BACKGROUND_FUNCTIONS')
        return 'true'
      if (key === 'ENV_NAME')
        return 'capgo_plugin-eu-prod-test'
      if (key === 'SB_REGION')
        return 'eu-west-3'
      if (key === 'SUPABASE_DB_URL')
        return 'postgres://supabase-direct'
      if (key === 'MAIN_SUPABASE_DB_URL')
        return 'postgres://main-pooler'
      return ''
    })

    const { getPgClient, closeClient } = await import('../supabase/functions/_backend/plugin_runtime/utils/pg.ts')
    const c = createContext()

    const first = getPgClient(c, true)
    const second = getPgClient(c, true)

    expect(first).not.toBe(second)
    expect(PoolMock).toHaveBeenCalledTimes(2)

    await closeClient(c, first)
    expect(endMock).toHaveBeenCalledTimes(1)
  })

  it('still creates a fresh Pool outside workerd and ends it on close', async () => {
    getRuntimeKeyMock.mockReturnValue('node')
    const endMock = vi.fn(async () => undefined)
    PoolMock.mockImplementation(function PoolMock(this: { on: typeof poolOnMock, end: typeof endMock }) {
      this.on = poolOnMock
      this.end = endMock
      return this
    })

    const { getPgClient, closeClient } = await import('../supabase/functions/_backend/plugin_runtime/utils/pg.ts')
    const c = createContext()

    const first = getPgClient(c, true)
    const second = getPgClient(c, true)

    expect(first).not.toBe(second)
    expect(PoolMock).toHaveBeenCalledTimes(2)

    await closeClient(c, first)
    expect(endMock).toHaveBeenCalledTimes(1)
  })
})
