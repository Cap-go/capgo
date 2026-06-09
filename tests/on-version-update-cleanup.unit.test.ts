import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appVersionsUpdate,
  appVersionsUpdateEq,
  appVersionsMetaSelectEq,
  appVersionsMetaUpsert,
  appVersionsMetaUpsertEq,
  appVersionsMetaUpdate,
  appVersionsMetaUpdateEq,
  closeClient,
  createStatsMeta,
  deleteObject,
  getSize,
  getDrizzleClient,
  getPgClient,
  manifestDeleteEq,
  manifestInsert,
  manifestReferenceMaybeSingle,
  manifestSelectLimit,
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
  const appVersionsUpdateEq = vi.fn()
  const appVersionsUpdate = vi.fn(() => ({ eq: appVersionsUpdateEq }))
  const manifestDeleteEq = vi.fn()
  const manifestDelete = vi.fn(() => ({ eq: manifestDeleteEq }))
  const manifestInsert = vi.fn()
  const manifestSelectLimit = vi.fn()
  const manifestReferenceMaybeSingle = vi.fn()
  const manifestReferenceLimit = vi.fn(() => ({ maybeSingle: manifestReferenceMaybeSingle }))
  const manifestReferenceEqFileName = vi.fn(() => ({ limit: manifestReferenceLimit }))
  const manifestReferenceEqFileHash = vi.fn((column: string) => {
    if (column === 'app_version_id')
      return { limit: manifestSelectLimit }
    return { eq: manifestReferenceEqFileName }
  })
  const manifestSelect = vi.fn(() => ({ eq: manifestReferenceEqFileHash }))
  const supabaseFrom = vi.fn((table: string) => {
    if (table === 'app_versions') {
      return {
        update: appVersionsUpdate,
      }
    }
    if (table === 'app_versions_meta') {
      return {
        select: appVersionsMetaSelect,
        upsert: appVersionsMetaUpsert,
        update: appVersionsMetaUpdate,
      }
    }
    if (table === 'manifest') {
      return {
        delete: manifestDelete,
        insert: manifestInsert,
        select: manifestSelect,
      }
    }
    return {}
  })
  const manifestSelectWhere = vi.fn(async (): Promise<any[]> => [])
  const pgQuery = vi.fn(async () => ({ rows: [] }))

  return {
    appVersionsUpdate,
    appVersionsUpdateEq,
    appVersionsMetaSelectEq,
    appVersionsMetaUpsert,
    appVersionsMetaUpsertEq,
    appVersionsMetaUpdate,
    appVersionsMetaUpdateEq,
    closeClient: vi.fn(),
    createStatsMeta: vi.fn(),
    deleteObject: vi.fn(),
    getSize: vi.fn(),
    getDrizzleClient: vi.fn(() => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: manifestSelectWhere,
        })),
      })),
    })),
    getPgClient: vi.fn(() => ({ query: pgQuery })),
    manifestDeleteEq,
    manifestInsert,
    manifestReferenceMaybeSingle,
    manifestSelectLimit,
    manifestSelectWhere,
    moveObjectToTrash: vi.fn(),
    pgQuery,
    supabaseAdmin: vi.fn(() => ({ from: supabaseFrom })),
    supabaseFrom,
  }
})

vi.mock('../supabase/functions/_backend/utils/s3.ts', () => ({
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

const { app, deleteIt, onVersionUpdateTestUtils } = await import('../supabase/functions/_backend/triggers/on_version_update.ts')

const API_SECRET = 'testsecret'

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
    manifest_count: 0,
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
    manifestInsert.mockResolvedValue({ error: null })
    manifestReferenceMaybeSingle.mockResolvedValue({ data: null, error: null })
    manifestSelectLimit.mockResolvedValue({ data: [], error: null })
    pgQuery.mockResolvedValue({ rows: [] })
    getSize.mockResolvedValue(1234)
    appVersionsUpdateEq.mockResolvedValue({ error: null })
    appVersionsMetaSelectEq.mockReturnValue({
      single: vi.fn(async () => ({ data: { size: 1234 }, error: null })),
    })
    appVersionsMetaUpsertEq.mockResolvedValue({ error: null })
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

describe('on_version_update bundle size metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createStatsMeta.mockResolvedValue({ error: null })
    getSize.mockResolvedValue(4321)
    manifestInsert.mockResolvedValue({ error: null })
    manifestSelectLimit.mockResolvedValue({ data: [], error: null })
    pgQuery.mockResolvedValue({ rows: [] })
    appVersionsUpdateEq.mockResolvedValue({ error: null })
    appVersionsMetaUpsertEq.mockResolvedValue({ error: null })
  })

  it('does not write zero metadata for r2-direct upload snapshots', async () => {
    const response = await onVersionUpdateTestUtils.updateIt(createContext(), createVersion({
      owner_org: 'org-1',
      storage_provider: 'r2-direct',
    }))

    expect(response.status).toBe(200)
    expect(getSize).not.toHaveBeenCalled()
    expect(appVersionsMetaUpsert).not.toHaveBeenCalled()
    expect(createStatsMeta).not.toHaveBeenCalled()
  })

  it('persists manifest-only R2 updates without requiring a bundle path', async () => {
    const response = await onVersionUpdateTestUtils.updateIt(createContext(), createVersion({
      manifest: [{
        file_hash: 'manifest-hash',
        file_name: 'assets/signup%402x.png',
        s3_path: 'orgs/org-1/apps/com.cleanup.test/delta/hash_assets/signup%402x.png',
      }],
      owner_org: 'org-1',
      r2_path: null,
      storage_provider: 'r2',
    }))

    expect(response.status).toBe(200)
    expect(getSize).not.toHaveBeenCalled()
    expect(appVersionsMetaUpsert).toHaveBeenCalledWith({
      app_id: 'com.cleanup.test',
      checksum: '',
      id: 123,
      owner_org: 'org-1',
      size: 0,
    }, {
      onConflict: 'id',
    })
    expect(manifestInsert).toHaveBeenCalledWith([expect.objectContaining({
      app_version_id: 123,
      file_hash: 'manifest-hash',
      file_name: 'assets/signup@2x.png',
      file_size: 0,
      s3_path: 'orgs/org-1/apps/com.cleanup.test/delta/hash_assets/signup%402x.png',
    })])
    expect(appVersionsUpdate).toHaveBeenCalledWith({ manifest_count: 1 })
    expect(appVersionsUpdate).toHaveBeenCalledWith({ manifest: null })
  })

  it('writes positive R2 bundle size metadata for completed uploads', async () => {
    const response = await onVersionUpdateTestUtils.updateIt(createContext(), createVersion({
      checksum: 'checksum-1',
      owner_org: 'org-1',
      storage_provider: 'r2',
    }))

    expect(response.status).toBe(200)
    expect(getSize).toHaveBeenCalledWith(expect.anything(), 'orgs/org-1/apps/com.cleanup.test/1.0.0.zip')
    expect(appVersionsMetaUpsert).toHaveBeenCalledWith({
      app_id: 'com.cleanup.test',
      checksum: 'checksum-1',
      id: 123,
      owner_org: 'org-1',
      size: 4321,
    }, {
      onConflict: 'id',
    })
    expect(appVersionsMetaUpsertEq).toHaveBeenCalledWith('id', 123)
    expect(createStatsMeta).toHaveBeenCalledWith(expect.anything(), 'com.cleanup.test', 123, 4321)
  })

  it('keeps completed R2 uploads retryable when object size is not available yet', async () => {
    getSize.mockResolvedValue(0)

    await expect(onVersionUpdateTestUtils.updateIt(createContext(), createVersion({
      owner_org: 'org-1',
      storage_provider: 'r2',
    }))).rejects.toThrow('Bundle file size metadata was not found')

    expect(getSize).toHaveBeenCalledTimes(3)
    expect(appVersionsMetaUpsert).not.toHaveBeenCalled()
    expect(createStatsMeta).not.toHaveBeenCalled()
  })

  it('keeps the webhook retryable for R2 updates that have no bundle path or manifest yet', async () => {
    const previousApiSecret = process.env.API_SECRET
    process.env.API_SECRET = API_SECRET

    try {
      const response = await app.request('http://local/', {
        body: JSON.stringify({
          old_record: createVersion({
            manifest: null,
            r2_path: null,
            storage_provider: 'r2',
          }),
          record: createVersion({
            manifest: null,
            owner_org: 'org-1',
            r2_path: null,
            storage_provider: 'r2',
          }),
          table: 'app_versions',
          type: 'UPDATE',
        }),
        headers: {
          'apisecret': API_SECRET,
          'content-type': 'application/json',
        },
        method: 'POST',
      })

      expect(response.status).toBe(503)
      expect(await response.text()).toContain('Bundle R2 path is not ready')
    }
    finally {
      if (previousApiSecret === undefined)
        delete process.env.API_SECRET
      else
        process.env.API_SECRET = previousApiSecret
    }
  })

  it('does not retry persisted manifest-only R2 versions on later metadata edits', async () => {
    const response = await onVersionUpdateTestUtils.updateIt(createContext(), createVersion({
      manifest_count: 3,
      owner_org: 'org-1',
      r2_path: null,
      storage_provider: 'r2',
    }))

    expect(response.status).toBe(200)
    expect(getSize).not.toHaveBeenCalled()
    expect(appVersionsMetaUpsert).not.toHaveBeenCalled()
    expect(createStatsMeta).not.toHaveBeenCalled()
  })

  it('does not retry the manifest cleanup update after manifest rows are persisted', async () => {
    const previousApiSecret = process.env.API_SECRET
    process.env.API_SECRET = API_SECRET

    try {
      const response = await app.request('http://local/', {
        body: JSON.stringify({
          old_record: createVersion({
            manifest: [{
              file_hash: 'manifest-hash',
              file_name: 'assets/signup%402x.png',
              s3_path: 'orgs/org-1/apps/com.cleanup.test/delta/hash_assets/signup%402x.png',
            }],
            r2_path: null,
            storage_provider: 'r2',
          }),
          record: createVersion({
            manifest: null,
            owner_org: 'org-1',
            r2_path: null,
            storage_provider: 'r2',
          }),
          table: 'app_versions',
          type: 'UPDATE',
        }),
        headers: {
          'apisecret': API_SECRET,
          'content-type': 'application/json',
        },
        method: 'POST',
      })

      expect(response.status).toBe(200)
      expect(getSize).not.toHaveBeenCalled()
      expect(appVersionsMetaUpsert).not.toHaveBeenCalled()
    }
    finally {
      if (previousApiSecret === undefined)
        delete process.env.API_SECRET
      else
        process.env.API_SECRET = previousApiSecret
    }
  })

  it('does not retry the webhook for later metadata edits on persisted manifest-only versions', async () => {
    const previousApiSecret = process.env.API_SECRET
    process.env.API_SECRET = API_SECRET

    try {
      const response = await app.request('http://local/', {
        body: JSON.stringify({
          old_record: createVersion({
            manifest: null,
            manifest_count: 3,
            r2_path: null,
            storage_provider: 'r2',
          }),
          record: createVersion({
            manifest: null,
            manifest_count: 3,
            owner_org: 'org-1',
            r2_path: null,
            storage_provider: 'r2',
          }),
          table: 'app_versions',
          type: 'UPDATE',
        }),
        headers: {
          'apisecret': API_SECRET,
          'content-type': 'application/json',
        },
        method: 'POST',
      })

      expect(response.status).toBe(200)
      expect(getSize).not.toHaveBeenCalled()
      expect(appVersionsMetaUpsert).not.toHaveBeenCalled()
    }
    finally {
      if (previousApiSecret === undefined)
        delete process.env.API_SECRET
      else
        process.env.API_SECRET = previousApiSecret
    }
  })
})
