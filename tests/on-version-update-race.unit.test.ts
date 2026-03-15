import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const metaEq = vi.fn()
  const metaUpsert = vi.fn(() => ({ eq: metaEq }))
  const getPath = vi.fn()
  const getSize = vi.fn()
  const createStatsMeta = vi.fn()
  const cloudlog = vi.fn()

  const supabaseAdmin = vi.fn(() => ({
    from: (table: string) => {
      if (table === 'apps') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle,
            }),
          }),
        }
      }

      if (table === 'app_versions_meta') {
        return {
          upsert: metaUpsert,
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }))

  return {
    cloudlog,
    createStatsMeta,
    getPath,
    getSize,
    maybeSingle,
    metaEq,
    metaUpsert,
    supabaseAdmin,
  }
})

vi.mock('../supabase/functions/_backend/utils/hono.ts', () => ({
  BRES: { status: 'ok' },
  middlewareAPISecret: async (_c: any, next: () => Promise<void>) => {
    await next()
  },
  triggerValidator: () => async (c: any, next: () => Promise<void>) => {
    const body = await c.req.json()
    c.set('webhookBody', body.record)
    c.set('oldRecord', body.old_record)
    await next()
  },
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: mocks.cloudlog,
}))

vi.mock('../supabase/functions/_backend/utils/s3.ts', () => ({
  getPath: mocks.getPath,
  s3: {
    getSize: mocks.getSize,
  },
}))

vi.mock('../supabase/functions/_backend/utils/stats.ts', () => ({
  createStatsMeta: mocks.createStatsMeta,
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

function createVersionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '2a0e1480-0adf-4bf8-8d35-9e5b10f5198c',
    app_id: 'com.test.missing-app',
    owner_org: '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    r2_path: 'orgs/test/apps/com.test.missing-app/1.0.0.zip',
    storage_provider: 'supabase',
    checksum: null,
    manifest: null,
    deleted_at: null,
    name: '1.0.0',
    ...overrides,
  }
}

describe('on_version_update queued app deletion race', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    mocks.metaEq.mockResolvedValue({ error: null })
    mocks.getPath.mockResolvedValue(null)
    mocks.getSize.mockResolvedValue(321)
    mocks.createStatsMeta.mockResolvedValue({ error: null })
  })

  it('skips app_versions_meta upsert for missing apps on non-R2 updates', async () => {
    const { app } = await import('../supabase/functions/_backend/triggers/on_version_update.ts')
    const record = createVersionRecord()

    const response = await app.request(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: 'app_versions',
        type: 'UPDATE',
        record,
        old_record: record,
      }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(mocks.maybeSingle).toHaveBeenCalledOnce()
    expect(mocks.metaUpsert).not.toHaveBeenCalled()
    expect(mocks.createStatsMeta).not.toHaveBeenCalled()
  })

  it('skips app_versions_meta upsert for missing apps on R2 updates', async () => {
    const { app } = await import('../supabase/functions/_backend/triggers/on_version_update.ts')
    const record = createVersionRecord({
      storage_provider: 'r2',
    })
    mocks.getPath.mockResolvedValue('orgs/test/apps/com.test.missing-app/1.0.0.zip')

    const response = await app.request(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: 'app_versions',
        type: 'UPDATE',
        record,
        old_record: record,
      }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(mocks.getSize).toHaveBeenCalledOnce()
    expect(mocks.maybeSingle).toHaveBeenCalledOnce()
    expect(mocks.metaUpsert).not.toHaveBeenCalled()
    expect(mocks.createStatsMeta).not.toHaveBeenCalled()
  })
})
