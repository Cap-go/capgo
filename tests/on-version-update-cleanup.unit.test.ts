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
  manifestDeleteEq,
  manifestEntries,
  manifestSelectFileNameEq,
  manifestSelectHashEq,
  manifestSelectPathEq,
  pgQuery,
  supabaseAdmin,
} = vi.hoisted(() => {
  const appVersionsMetaSelectEq = vi.fn()
  const appVersionsMetaSelect = vi.fn(() => ({ eq: appVersionsMetaSelectEq }))
  const appVersionsMetaUpdateEq = vi.fn()
  const appVersionsMetaUpdate = vi.fn(() => ({ eq: appVersionsMetaUpdateEq }))
  const manifestEntries: any[] = []
  const manifestDeleteEq = vi.fn()
  const manifestDelete = vi.fn(() => ({ eq: manifestDeleteEq }))
  const manifestSelectPathEq = vi.fn()
  const manifestSelectHashEq = vi.fn(() => ({ eq: manifestSelectPathEq }))
  const manifestSelectFileNameEq = vi.fn(() => ({ eq: manifestSelectHashEq }))
  const manifestSelect = vi.fn(() => ({ eq: manifestSelectFileNameEq }))
  const supabaseFrom = vi.fn((table: string) => {
    if (table === 'app_versions_meta') {
      return {
        select: appVersionsMetaSelect,
        update: appVersionsMetaUpdate,
      }
    }
    if (table === 'manifest') {
      return {
        delete: manifestDelete,
        select: manifestSelect,
      }
    }
    return {}
  })
  const pgQuery = vi.fn()

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
          where: vi.fn(async () => manifestEntries),
        })),
      })),
    })),
    getPgClient: vi.fn(() => ({ query: pgQuery })),
    manifestDeleteEq,
    manifestEntries,
    manifestSelectFileNameEq,
    manifestSelectHashEq,
    manifestSelectPathEq,
    pgQuery,
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

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  backgroundTask: vi.fn((_c: unknown, promise: Promise<unknown>) => promise),
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
    manifestEntries.length = 0
    deleteObject.mockResolvedValue(true)
    createStatsMeta.mockResolvedValue({ error: null })
    manifestDeleteEq.mockResolvedValue({ error: null })
    manifestSelectPathEq.mockResolvedValue({ error: null, count: 0 })
    pgQuery.mockResolvedValue({ rows: [], rowCount: 1 })
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

  it('still deletes manifest rows when version metadata is missing', async () => {
    manifestEntries.push({
      id: 456,
      app_version_id: 123,
      file_name: 'www/app.js',
      file_hash: 'hash-1',
      s3_path: 'orgs/org-1/apps/com.cleanup.test/manifest/www/app.js',
    })
    appVersionsMetaSelectEq.mockReturnValue({
      single: vi.fn(async () => ({ data: null, error: { message: 'not found' } })),
    })

    const response = await deleteIt(createContext(), createVersion({ r2_path: null }))

    expect(response.status).toBe(200)
    expect(appVersionsMetaUpdate).not.toHaveBeenCalled()
    expect(createStatsMeta).not.toHaveBeenCalled()
    expect(manifestDeleteEq).toHaveBeenCalledWith('id', 456)
    expect(manifestSelectFileNameEq).toHaveBeenCalledWith('file_name', 'www/app.js')
    expect(manifestSelectHashEq).toHaveBeenCalledWith('file_hash', 'hash-1')
    expect(manifestSelectPathEq).toHaveBeenCalledWith('s3_path', 'orgs/org-1/apps/com.cleanup.test/manifest/www/app.js')
    expect(deleteObject).toHaveBeenCalledWith(expect.anything(), 'orgs/org-1/apps/com.cleanup.test/manifest/www/app.js')
  })

  it('keeps shared manifest files in storage when another version still references them', async () => {
    manifestEntries.push({
      id: 654,
      app_version_id: 123,
      file_name: 'www/shared.js',
      file_hash: 'hash-shared',
      s3_path: 'orgs/org-1/apps/com.cleanup.test/manifest/www/shared.js',
    })
    manifestSelectPathEq.mockResolvedValue({ error: null, count: 1 })

    const response = await deleteIt(createContext(), createVersion({ r2_path: null }))

    expect(response.status).toBe(200)
    expect(manifestDeleteEq).toHaveBeenCalledWith('id', 654)
    expect(manifestSelectFileNameEq).toHaveBeenCalledWith('file_name', 'www/shared.js')
    expect(manifestSelectHashEq).toHaveBeenCalledWith('file_hash', 'hash-shared')
    expect(manifestSelectPathEq).toHaveBeenCalledWith('s3_path', 'orgs/org-1/apps/com.cleanup.test/manifest/www/shared.js')
    expect(deleteObject).not.toHaveBeenCalledWith(expect.anything(), 'orgs/org-1/apps/com.cleanup.test/manifest/www/shared.js')
  })

  it('resets manifest counters after deleting manifest entries', async () => {
    manifestEntries.push({
      id: 789,
      app_version_id: 123,
      file_name: 'www/index.html',
      file_hash: 'hash-2',
      s3_path: 'orgs/org-1/apps/com.cleanup.test/manifest/www/index.html',
    })

    const response = await deleteIt(createContext(), createVersion({ r2_path: null }))

    expect(response.status).toBe(200)
    expect(pgQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE app_versions SET manifest_count = 0 WHERE id = $1'),
      [123],
    )
    expect(pgQuery).toHaveBeenCalledWith(
      expect.stringContaining('manifest_bundle_count = GREATEST(manifest_bundle_count - 1, 0)'),
      ['com.cleanup.test'],
    )
  })
})
