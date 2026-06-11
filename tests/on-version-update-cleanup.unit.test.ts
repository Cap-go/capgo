import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appVersionsMetaSelectEq,
  appVersionsMetaUpsert,
  appVersionsMetaUpsertEq,
  appVersionsMetaUpdate,
  appVersionsMetaUpdateEq,
  closeClient,
  createStatsMeta,
  deleteObject,
  getDrizzleClient,
  getPath,
  getPgClient,
  getSize,
  manifestDeleteEq,
  manifestReferenceMaybeSingle,
  manifestSelectWhere,
  moveObjectToTrash,
  pgQuery,
  supabaseAdmin,
} = vi.hoisted(() => {
  const appVersionsMetaSelectEq = vi.fn()
  const appVersionsMetaSelect = vi.fn(() => ({ eq: appVersionsMetaSelectEq }))
  const appVersionsMetaUpsertEq = vi.fn()
  const appVersionsMetaUpsert = vi.fn(() => ({ eq: appVersionsMetaUpsertEq }))
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
        upsert: appVersionsMetaUpsert,
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
    appVersionsMetaUpsert,
    appVersionsMetaUpsertEq,
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
    getPath: vi.fn(),
    getPgClient: vi.fn(() => ({ query: pgQuery })),
    getSize: vi.fn(),
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
  getPath,
  s3: {
    deleteObject,
    getSize,
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

const { deleteIt, updateIt } = await import('../supabase/functions/_backend/triggers/on_version_update.ts')

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
    owner_org: 'org-1',
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
    getPath.mockResolvedValue('orgs/org-1/apps/com.cleanup.test/1.0.0.zip')
    getSize.mockResolvedValue(9876)
    pgQuery.mockResolvedValue({ rows: [] })
    appVersionsMetaSelectEq.mockReturnValue({
      single: vi.fn(async () => ({ data: { size: 1234 }, error: null })),
    })
    appVersionsMetaUpdateEq.mockResolvedValue({ error: null })
    appVersionsMetaUpsertEq.mockResolvedValue({ error: null })
  })

  it('does not write zero metadata while an r2-direct upload is still finalizing', async () => {
    const response = await updateIt(createContext(), createVersion({ storage_provider: 'r2-direct' }))

    expect(response.status).toBe(200)
    expect(getPath).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ storage_provider: 'r2-direct' }))
    expect(getSize).not.toHaveBeenCalled()
    expect(appVersionsMetaUpsert).not.toHaveBeenCalled()
    expect(createStatsMeta).not.toHaveBeenCalled()
  })

  it('does not write zero metadata when an r2-direct upload has no object yet', async () => {
    getPath.mockResolvedValue(null)

    const response = await updateIt(createContext(), createVersion({ storage_provider: 'r2-direct' }))

    expect(response.status).toBe(200)
    expect(getSize).not.toHaveBeenCalled()
    expect(appVersionsMetaUpsert).not.toHaveBeenCalled()
    expect(createStatsMeta).not.toHaveBeenCalled()
  })

  it('does not write zero metadata when a finalized r2 upload has no readable object path', async () => {
    getPath.mockResolvedValue(null)

    const response = await updateIt(createContext(), createVersion({ storage_provider: 'r2' }))

    expect(response.status).toBe(200)
    expect(getSize).not.toHaveBeenCalled()
    expect(appVersionsMetaUpsert).not.toHaveBeenCalled()
    expect(createStatsMeta).not.toHaveBeenCalled()
  })

  it('stores the real R2 size once the upload is finalized', async () => {
    const response = await updateIt(createContext(), createVersion({ storage_provider: 'r2' }))

    expect(response.status).toBe(200)
    expect(getSize).toHaveBeenCalledWith(expect.anything(), 'orgs/org-1/apps/com.cleanup.test/1.0.0.zip')
    expect(appVersionsMetaUpsert).toHaveBeenCalledWith({
      app_id: 'com.cleanup.test',
      checksum: '',
      id: 123,
      owner_org: 'org-1',
      size: 9876,
    }, {
      onConflict: 'id',
    })
    expect(appVersionsMetaUpsertEq).toHaveBeenCalledWith('id', 123)
    expect(createStatsMeta).toHaveBeenCalledWith(expect.anything(), 'com.cleanup.test', 123, 9876)
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
    expect(pgQuery).toHaveBeenCalledWith('UPDATE app_versions SET manifest_count = 0 WHERE id = $1', [123])
    expect(pgQuery).toHaveBeenCalledWith(expect.stringContaining('manifest_bundle_count = GREATEST(manifest_bundle_count - 1, 0)'), ['com.cleanup.test'])
  })

  it('keeps the queue retryable when moving the bundle to trash fails', async () => {
    moveObjectToTrash.mockResolvedValue(false)

    await expect(deleteIt(createContext(), createVersion())).rejects.toThrow('Cannot move S3 object for deleted version to trash')
    expect(appVersionsMetaUpdate).not.toHaveBeenCalled()
    expect(createStatsMeta).not.toHaveBeenCalled()
  })
})
