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
  manifestReferenceMaybeSingle,
  manifestSelectWhere,
  moveObjectToTrash,
  pgQuery,
  supabaseAdmin,
} = vi.hoisted(() => {
  const appVersionsMetaSelectEq = vi.fn()
  const appVersionsMetaSelect = vi.fn(() => ({ eq: appVersionsMetaSelectEq }))
  const appVersionsMetaUpdateEq = vi.fn()
  const appVersionsMetaUpdate = vi.fn(() => ({ eq: appVersionsMetaUpdateEq }))
  const manifestDeleteEq = vi.fn()
  const manifestDelete = vi.fn(() => ({ eq: manifestDeleteEq }))
  const manifestReferenceMaybeSingle = vi.fn()
  const manifestReferenceLimit = vi.fn(() => ({ maybeSingle: manifestReferenceMaybeSingle }))
  const manifestReferenceEqFileName = vi.fn(() => ({ limit: manifestReferenceLimit }))
  const manifestReferenceEqFileHash = vi.fn(() => ({ eq: manifestReferenceEqFileName }))
  const manifestSelect = vi.fn(() => ({ eq: manifestReferenceEqFileHash }))
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
  const manifestSelectWhere = vi.fn(async (): Promise<any[]> => [])
  const pgQuery = vi.fn(async () => ({ rows: [] }))

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
          where: manifestSelectWhere,
        })),
      })),
    })),
    getPgClient: vi.fn(() => ({ query: pgQuery })),
    manifestDeleteEq,
    manifestReferenceMaybeSingle,
    manifestSelectWhere,
    moveObjectToTrash: vi.fn(),
    pgQuery,
    supabaseAdmin: vi.fn(() => ({ from: supabaseFrom })),
    supabaseFrom,
  }
})

vi.mock('../supabase/functions/_backend/utils/s3.ts', () => ({
  getPath: vi.fn(),
  s3: {
    deleteObject,
    moveObjectToTrash,
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
    moveObjectToTrash.mockResolvedValue(true)
    createStatsMeta.mockResolvedValue({ error: null })
    manifestSelectWhere.mockResolvedValue([])
    manifestDeleteEq.mockResolvedValue({ error: null })
    manifestReferenceMaybeSingle.mockResolvedValue({ data: null, error: null })
    pgQuery.mockResolvedValue({ rows: [] })
    appVersionsMetaSelectEq.mockReturnValue({
      single: vi.fn(async () => ({ data: { size: 1234 }, error: null })),
    })
    appVersionsMetaUpdateEq.mockResolvedValue({ error: null })
  })

  it('moves the bundle to trash and clears stored size for soft-deleted versions', async () => {
    const response = await deleteIt(createContext(), createVersion())

    expect(response.status).toBe(200)
    expect(moveObjectToTrash).toHaveBeenCalledWith(expect.anything(), 'orgs/org-1/apps/com.cleanup.test/1.0.0.zip')
    expect(deleteObject).not.toHaveBeenCalled()
    expect(appVersionsMetaUpdate).toHaveBeenCalledWith({ size: 0 })
    expect(appVersionsMetaUpdateEq).toHaveBeenCalledWith('id', 123)
    expect(createStatsMeta).toHaveBeenCalledWith(expect.anything(), 'com.cleanup.test', 123, -1234)
  })

  it('still clears stale metadata when the deleted version has no bundle path', async () => {
    const response = await deleteIt(createContext(), createVersion({ r2_path: null }))

    expect(response.status).toBe(200)
    expect(moveObjectToTrash).not.toHaveBeenCalled()
    expect(appVersionsMetaUpdate).toHaveBeenCalledWith({ size: 0 })
    expect(createStatsMeta).toHaveBeenCalledWith(expect.anything(), 'com.cleanup.test', 123, -1234)
  })

  it('moves unreferenced manifest files to trash instead of hard deleting them', async () => {
    manifestSelectWhere.mockResolvedValue([{
      app_version_id: 123,
      file_hash: 'manifest-hash',
      file_name: 'index.js',
      id: 456,
      s3_path: 'orgs/org-1/apps/com.cleanup.test/manifest/index.js',
    }])

    const response = await deleteIt(createContext(), createVersion({ r2_path: null }))

    expect(response.status).toBe(200)
    expect(moveObjectToTrash).toHaveBeenCalledWith(expect.anything(), 'orgs/org-1/apps/com.cleanup.test/manifest/index.js')
    expect(deleteObject).not.toHaveBeenCalled()
    expect(pgQuery).toHaveBeenCalledWith('UPDATE app_versions SET manifest_count = 0, manifest = NULL WHERE id = $1', [123])
    expect(pgQuery).toHaveBeenCalledWith(expect.stringContaining('manifest_bundle_count = GREATEST(manifest_bundle_count - 1, 0)'), ['com.cleanup.test'])
  })

  it('keeps the queue retryable when moving the bundle to trash fails', async () => {
    moveObjectToTrash.mockResolvedValue(false)

    await expect(deleteIt(createContext(), createVersion())).rejects.toThrow('Cannot move S3 object for deleted version to trash')
    expect(appVersionsMetaUpdate).not.toHaveBeenCalled()
    expect(createStatsMeta).not.toHaveBeenCalled()
  })
})
