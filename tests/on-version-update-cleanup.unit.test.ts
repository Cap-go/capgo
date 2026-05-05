import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appVersionsMetaSelectEq,
  appVersionsMetaUpdate,
  appVersionsMetaUpdateEq,
  closeClient,
  createStatsMeta,
  deleteObject,
  getDrizzleClient,
  getPgClient,
  supabaseAdmin,
} = vi.hoisted(() => {
  const appVersionsMetaSelectEq = vi.fn()
  const appVersionsMetaSelect = vi.fn(() => ({ eq: appVersionsMetaSelectEq }))
  const appVersionsMetaUpdateEq = vi.fn()
  const appVersionsMetaUpdate = vi.fn(() => ({ eq: appVersionsMetaUpdateEq }))
  const supabaseFrom = vi.fn((table: string) => {
    if (table === 'app_versions_meta') {
      return {
        select: appVersionsMetaSelect,
        update: appVersionsMetaUpdate,
      }
    }
    return {}
  })

  return {
    appVersionsMetaSelectEq,
    appVersionsMetaUpdate,
    appVersionsMetaUpdateEq,
    closeClient: vi.fn(),
    createStatsMeta: vi.fn(),
    deleteObject: vi.fn(),
    getDrizzleClient: vi.fn(() => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => []),
        })),
      })),
    })),
    getPgClient: vi.fn(() => ({})),
    supabaseAdmin: vi.fn(() => ({ from: supabaseFrom })),
    supabaseFrom,
  }
})

vi.mock('../supabase/functions/_backend/utils/s3.ts', () => ({
  getPath: vi.fn(),
  s3: {
    deleteObject,
  },
}))

vi.mock('../supabase/functions/_backend/utils/stats.ts', () => ({
  createStatsMeta,
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin,
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient,
  getDrizzleClient,
  getPgClient,
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: vi.fn(),
  cloudlogErr: vi.fn(),
}))

const { deleteIt } = await import('../supabase/functions/_backend/triggers/on_version_update.ts')

function createContext() {
  return {
    get: vi.fn(() => undefined),
    json: vi.fn((body: unknown, status = 200) => new Response(JSON.stringify(body), { status })),
  } as any
}

function createVersion(overrides: Record<string, unknown> = {}) {
  return {
    app_id: 'com.cleanup.test',
    id: 123,
    manifest: null,
    name: '1.0.0',
    r2_path: 'orgs/org-1/apps/com.cleanup.test/1.0.0.zip',
    storage_provider: 'r2',
    ...overrides,
  } as any
}

describe('on_version_update deleted version cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteObject.mockResolvedValue(true)
    createStatsMeta.mockResolvedValue({ error: null })
    appVersionsMetaSelectEq.mockReturnValue({
      single: vi.fn(async () => ({ data: { size: 1234 }, error: null })),
    })
    appVersionsMetaUpdateEq.mockResolvedValue({ error: null })
  })

  it('deletes the bundle directly and clears stored size for soft-deleted versions', async () => {
    const response = await deleteIt(createContext(), createVersion())

    expect(response.status).toBe(200)
    expect(deleteObject).toHaveBeenCalledWith(expect.anything(), 'orgs/org-1/apps/com.cleanup.test/1.0.0.zip')
    expect(appVersionsMetaUpdate).toHaveBeenCalledWith({ size: 0 })
    expect(appVersionsMetaUpdateEq).toHaveBeenCalledWith('id', 123)
    expect(createStatsMeta).toHaveBeenCalledWith(expect.anything(), 'com.cleanup.test', 123, -1234)
  })

  it('still clears stale metadata when the deleted version has no bundle path', async () => {
    const response = await deleteIt(createContext(), createVersion({ r2_path: null }))

    expect(response.status).toBe(200)
    expect(deleteObject).not.toHaveBeenCalled()
    expect(appVersionsMetaUpdate).toHaveBeenCalledWith({ size: 0 })
    expect(createStatsMeta).toHaveBeenCalledWith(expect.anything(), 'com.cleanup.test', 123, -1234)
  })

  it('keeps the queue retryable when R2 deletion fails', async () => {
    deleteObject.mockResolvedValue(false)

    await expect(deleteIt(createContext(), createVersion())).rejects.toThrow('Cannot delete S3 object for deleted version')
    expect(appVersionsMetaUpdate).not.toHaveBeenCalled()
    expect(createStatsMeta).not.toHaveBeenCalled()
  })
})
