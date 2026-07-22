import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appVersionsMetaSelectEq,
  appVersionsMetaUpdate,
  appVersionsMetaUpdateEq,
  callOrder,
  checkIfExist,
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
  const callOrder: string[] = []
  const appVersionsMetaSelectEq = vi.fn()
  const appVersionsMetaSelect = vi.fn(() => ({ eq: appVersionsMetaSelectEq }))
  const appVersionsMetaUpdateEq = vi.fn()
  const appVersionsMetaUpdate = vi.fn(() => ({ eq: appVersionsMetaUpdateEq }))
  const manifestDeleteEq = vi.fn(async (..._args: any[]) => {
    callOrder.push('db_delete_row')
    return { error: null }
  })
  const manifestDelete = vi.fn(() => ({ eq: manifestDeleteEq }))
  const manifestReferenceMaybeSingle = vi.fn()
  const manifestReferenceLimit = vi.fn(() => ({ maybeSingle: manifestReferenceMaybeSingle }))
  const manifestReferenceNeq = vi.fn(() => ({ limit: manifestReferenceLimit }))
  const manifestReferenceEqFileName = vi.fn(() => ({ neq: manifestReferenceNeq }))
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
  const pgQuery = vi.fn(async (..._args: any[]) => ({ rows: [] as any[], rowCount: 0 }))
  const moveObjectToTrash = vi.fn(async (..._args: any[]) => {
    callOrder.push('r2_trash')
    return true
  })
  const checkIfExist = vi.fn(async () => true)

  return {
    appVersionsMetaSelectEq,
    appVersionsMetaUpdate,
    appVersionsMetaUpdateEq,
    callOrder,
    checkIfExist,
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
    moveObjectToTrash,
    pgQuery,
    supabaseAdmin: vi.fn(() => ({ from: supabaseFrom })),
    supabaseFrom,
  }
})

vi.mock('../supabase/functions/_backend/utils/s3.ts', () => ({
  getPath: vi.fn(),
  s3: {
    checkIfExist,
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

const { deleteIt, onVersionUpdateTestUtils } = await import('../supabase/functions/_backend/triggers/on_version_update.ts')

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

function mockSuccessfulDbFinalize() {
  pgQuery.mockImplementation(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK')
      return { rows: [], rowCount: 0 }
    if (sql.includes('SELECT COUNT(*)'))
      return { rows: [{ count: 0 }], rowCount: 1 }
    if (sql.includes('WITH prev AS'))
      return { rows: [], rowCount: 1 }
    return { rows: [], rowCount: 0 }
  })
}

function makeEntries(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    file_hash: `hash-${i}`,
    file_name: `file-${i}.js`,
    s3_path: `orgs/org-1/apps/com.cleanup.test/delta/file-${i}.js`,
  }))
}

describe('on_version_update deleted version cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callOrder.length = 0
    deleteObject.mockResolvedValue(true)
    moveObjectToTrash.mockImplementation(async () => {
      callOrder.push('r2_trash')
      return true
    })
    checkIfExist.mockResolvedValue(true)
    createStatsMeta.mockResolvedValue({ error: null })
    manifestSelectWhere.mockResolvedValue([])
    manifestReferenceMaybeSingle.mockResolvedValue({ data: null, error: null })
    manifestDeleteEq.mockImplementation(async () => {
      callOrder.push('db_delete_row')
      return { error: null }
    })
    mockSuccessfulDbFinalize()
    appVersionsMetaSelectEq.mockReturnValue({
      single: vi.fn(async () => ({ data: { size: 1234 }, error: null })),
    })
    appVersionsMetaUpdateEq.mockResolvedValue({ error: null })
  })

  it('moves the bundle to trash and clears stored size for soft-deleted versions', async () => {
    const response = await deleteIt(createContext(), createVersion())

    expect(response.status).toBe(200)
    expect(moveObjectToTrash).toHaveBeenCalledWith(expect.anything(), 'orgs/org-1/apps/com.cleanup.test/1.0.0.zip')
    expect(appVersionsMetaUpdate).toHaveBeenCalledWith({ size: 0 })
  })

  it('trashes R2 before deleting each manifest DB row', async () => {
    manifestSelectWhere.mockResolvedValue(makeEntries(1))

    await deleteIt(createContext(), createVersion({ r2_path: null, manifest_count: 1 }))

    expect(callOrder.indexOf('r2_trash')).toBeGreaterThanOrEqual(0)
    expect(callOrder.indexOf('db_delete_row')).toBeGreaterThan(callOrder.indexOf('r2_trash'))
    expect(pgQuery).toHaveBeenCalledWith('COMMIT')
  })

  it('does not delete DB rows when R2 trash fails', async () => {
    manifestSelectWhere.mockResolvedValue(makeEntries(1))
    moveObjectToTrash.mockImplementation(async () => {
      callOrder.push('r2_trash')
      return false
    })

    await expect(deleteIt(createContext(), createVersion({ r2_path: null, manifest_count: 1 }))).rejects.toThrow(
      'Cannot move S3 object for deleted manifest file to trash',
    )
    expect(callOrder).toContain('r2_trash')
    expect(callOrder).not.toContain('db_delete_row')
    expect(pgQuery).not.toHaveBeenCalledWith('COMMIT')
  })

  it('skips R2 trash when another version still references the file, then deletes the row', async () => {
    manifestSelectWhere.mockResolvedValue(makeEntries(1))
    manifestReferenceMaybeSingle.mockResolvedValue({ data: { id: 999 }, error: null })

    await deleteIt(createContext(), createVersion({ r2_path: null, manifest_count: 1 }))

    expect(moveObjectToTrash).not.toHaveBeenCalled()
    expect(callOrder).toContain('db_delete_row')
  })

  it('still clears manifests when version meta is missing', async () => {
    appVersionsMetaSelectEq.mockReturnValue({
      single: vi.fn(async () => ({ data: null, error: { message: 'not found' } })),
    })
    manifestSelectWhere.mockResolvedValue(makeEntries(1))

    const response = await deleteIt(createContext(), createVersion({ manifest_count: 1 }))

    expect(response.status).toBe(200)
    expect(callOrder.indexOf('r2_trash')).toBeLessThan(callOrder.indexOf('db_delete_row'))
    expect(moveObjectToTrash).toHaveBeenCalledWith(expect.anything(), 'orgs/org-1/apps/com.cleanup.test/1.0.0.zip')
  })

  it('keeps the queue retryable when moving the bundle to trash fails after manifest cleanup', async () => {
    manifestSelectWhere.mockResolvedValue(makeEntries(1))
    moveObjectToTrash.mockImplementation(async (_c: unknown, path: string) => {
      callOrder.push(path.includes('.zip') ? 'bundle_trash' : 'r2_trash')
      return !path.includes('.zip')
    })

    await expect(deleteIt(createContext(), createVersion({ manifest_count: 1 }))).rejects.toThrow(
      'Cannot move S3 object for deleted version to trash',
    )
    expect(callOrder).toContain('r2_trash')
    expect(callOrder).toContain('db_delete_row')
    expect(pgQuery).toHaveBeenCalledWith('COMMIT')
  })

  it('throws when rows remain after the trash/delete pass', async () => {
    manifestSelectWhere.mockResolvedValue(makeEntries(1))
    pgQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK')
        return { rows: [], rowCount: 0 }
      if (sql.includes('SELECT COUNT(*)'))
        return { rows: [{ count: 2 }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    })

    await expect(deleteIt(createContext(), createVersion({ r2_path: null, manifest_count: 1 }))).rejects.toThrow(
      'Manifest rows still present after trash/delete pass',
    )
    expect(pgQuery).toHaveBeenCalledWith('ROLLBACK')
  })

  it('routes already-deleted versions with leftover counts to cleanup_manifest', () => {
    expect(onVersionUpdateTestUtils.getDeletedVersionAction(
      createVersion({ deleted_at: '2026-01-01T00:00:00Z', manifest_count: 3 }),
      createVersion({ deleted_at: '2026-01-01T00:00:00Z', manifest_count: 3 }),
    )).toBe('cleanup_manifest')
  })
})

describe('on_version_update manifest cleanup load', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callOrder.length = 0
    createStatsMeta.mockResolvedValue({ error: null })
    manifestReferenceMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockSuccessfulDbFinalize()
    appVersionsMetaSelectEq.mockReturnValue({
      single: vi.fn(async () => ({ data: { size: 0 }, error: null })),
    })
    appVersionsMetaUpdateEq.mockResolvedValue({ error: null })
    manifestDeleteEq.mockImplementation(async () => {
      callOrder.push('db_delete_row')
      return { error: null }
    })
    moveObjectToTrash.mockImplementation(async () => {
      callOrder.push('r2_trash')
      return true
    })
  })

  it('handles 5000-file manifests with R2 before every DB delete and one final commit', async () => {
    const entries = makeEntries(5000)
    manifestSelectWhere.mockResolvedValue(entries)

    const response = await deleteIt(createContext(), createVersion({ r2_path: null, manifest_count: 5000 }))

    expect(response.status).toBe(200)
    expect(moveObjectToTrash).toHaveBeenCalledTimes(5000)
    expect(manifestDeleteEq).toHaveBeenCalledTimes(5000)
    expect(pgQuery).toHaveBeenCalledWith('COMMIT')

    const trashIndexes = callOrder.map((v, i) => v === 'r2_trash' ? i : -1).filter(i => i >= 0)
    const deleteIndexes = callOrder.map((v, i) => v === 'db_delete_row' ? i : -1).filter(i => i >= 0)
    expect(trashIndexes).toHaveLength(5000)
    expect(deleteIndexes).toHaveLength(5000)
    expect(deleteIndexes[0]).toBeGreaterThan(trashIndexes[0])
    expect(deleteIndexes.at(-1)!).toBeGreaterThan(trashIndexes[0])
  }, 30_000)

  it('keeps remaining rows retryable when one file in a large batch fails trash', async () => {
    const entries = makeEntries(200)
    manifestSelectWhere.mockResolvedValue(entries)
    moveObjectToTrash.mockImplementation(async (_c: unknown, path: string) => {
      callOrder.push('r2_trash')
      if (path.endsWith('file-150.js'))
        return false
      return true
    })

    await expect(deleteIt(createContext(), createVersion({ r2_path: null, manifest_count: 200 }))).rejects.toThrow(
      'Cannot move S3 object for deleted manifest file to trash',
    )

    const deletedIds = manifestDeleteEq.mock.calls.map(call => call[1] as number)
    expect(deletedIds).not.toContain(1150)
    expect(pgQuery).not.toHaveBeenCalledWith('COMMIT')
  }, 30_000)

  it('does not finalize counters while rows remain after a partial failure', async () => {
    manifestSelectWhere.mockResolvedValue(makeEntries(10))
    let deletes = 0
    manifestDeleteEq.mockImplementation((async () => {
      deletes += 1
      callOrder.push('db_delete_row')
      if (deletes >= 5)
        return { error: { message: 'db down' } }
      return { error: null }
    }) as any)
    moveObjectToTrash.mockImplementation(async () => {
      callOrder.push('r2_trash')
      return true
    })

    await expect(deleteIt(createContext(), createVersion({ r2_path: null, manifest_count: 10 }))).rejects.toThrow(
      'Cannot delete manifest row after R2 trash',
    )
    expect(pgQuery).not.toHaveBeenCalledWith(expect.stringContaining('WITH prev AS'))
  })
})
