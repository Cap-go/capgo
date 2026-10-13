import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appVersionsMetaSelectEq,
  appVersionsMetaUpdate,
  appVersionsMetaUpdateEq,
  callOrder,
  closeClient,
  createStatsMeta,
  deleteObject,
  drizzleTransaction,
  getDrizzleClient,
  getPgClient,
  manifestSelectWhere,
  moveObjectToTrash,
  pgQuery,
  purgeFileReadCache,
  restoreObjectFromTrash,
  supabaseAdmin,
  channelsUpdate,
} = vi.hoisted(() => {
  const callOrder: string[] = []
  const appVersionsMetaSelectEq = vi.fn()
  const appVersionsMetaSelect = vi.fn(() => ({ eq: appVersionsMetaSelectEq }))
  const appVersionsMetaUpdateEq = vi.fn()
  const appVersionsMetaUpdate = vi.fn(() => ({ eq: appVersionsMetaUpdateEq }))
  const channelsUpdateEq = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
  const channelsUpdate = vi.fn(() => ({ eq: channelsUpdateEq }))
  const supabaseFrom = vi.fn((table: string) => {
    if (table === 'app_versions_meta') {
      return {
        select: appVersionsMetaSelect,
        update: appVersionsMetaUpdate,
      }
    }
    if (table === 'channels') {
      return {
        update: channelsUpdate,
      }
    }
    return {}
  })
  const manifestSelectWhere = vi.fn(async (): Promise<any[]> => [])
  // Every suite installs its SQL behavior through mockCleanupPg().
  const pgQuery = vi.fn(async (_sql: string, _params?: any[]): Promise<any> => ({ rows: [], rowCount: 0 }))
  let dialectPromise: Promise<any> | undefined
  const compileDrizzleQuery = async (query: any) => {
    dialectPromise ??= import('drizzle-orm/pg-core').then(({ PgDialect }) => new PgDialect())
    const dialect = await dialectPromise
    return dialect.sqlToQuery(query)
  }
  const drizzleExecute = async (query: any) => {
    const { sql: queryText, params } = await compileDrizzleQuery(query)
    return pgQuery(queryText, params)
  }
  const drizzleDelete = (_table: unknown) => ({
    where: async (condition: any) => {
      const { sql: whereSql, params } = await compileDrizzleQuery(condition)
      return pgQuery(`DELETE FROM public.manifest WHERE ${whereSql}`, params)
    },
  })
  const drizzleTransaction = vi.fn(async (operation: (tx: { delete: typeof drizzleDelete, execute: typeof drizzleExecute }) => Promise<unknown>) => {
    callOrder.push('begin')
    try {
      const result = await operation({ delete: drizzleDelete, execute: drizzleExecute })
      callOrder.push('commit_entry')
      return result
    }
    catch (error) {
      callOrder.push('rollback_entry')
      throw error
    }
  })
  const moveObjectToTrash = vi.fn(async (..._args: any[]) => {
    callOrder.push('r2_trash')
    return true
  })
  return {
    appVersionsMetaSelectEq,
    appVersionsMetaUpdate,
    appVersionsMetaUpdateEq,
    channelsUpdate,
    channelsUpdateEq,
    callOrder,
    closeClient: vi.fn(),
    createStatsMeta: vi.fn(),
    deleteObject: vi.fn(),
    drizzleTransaction,
    getDrizzleClient: vi.fn(() => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: manifestSelectWhere,
        })),
      })),
      execute: drizzleExecute,
      transaction: drizzleTransaction,
    })),
    getPgClient: vi.fn(() => ({})),
    manifestSelectWhere,
    moveObjectToTrash,
    pgQuery,
    purgeFileReadCache: vi.fn(async () => {}),
    restoreObjectFromTrash: vi.fn(async (..._args: any[]) => true),
    supabaseAdmin: vi.fn(() => ({ from: supabaseFrom })),
  }
})

vi.mock('../supabase/functions/_backend/files/file_read_cache.ts', () => ({
  isVersionDeleted: (row: { deleted?: boolean | null, deleted_at?: string | Date | null } | null | undefined) => {
    if (!row)
      return false
    return row.deleted === true || row.deleted_at != null
  },
  purgeFileReadCache,
}))

vi.mock('../supabase/functions/_backend/utils/s3.ts', () => ({
  getPath: vi.fn(),
  s3: {
    deleteObject,
    moveObjectToTrash,
    restoreObjectFromTrash,
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
    deleted: true,
    deleted_at: '2026-01-01T00:00:00Z',
    app_id: 'com.cleanup.test',
    id: 123,
    manifest: null,
    manifest_count: 0,
    name: '1.0.0',
    owner_org: 'org-1',
    r2_path: 'orgs/org-1/apps/com.cleanup.test/1.0.0.zip',
    checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    storage_provider: 'r2',
    ...overrides,
  } as any
}

let rowsLeft = 0
let pendingPaths: string[] = []

function mockCleanupPg(count = 0, paths: string[] = []) {
  rowsLeft = count
  pendingPaths = [...paths]
  pgQuery.mockImplementation(async (query: string, params: any[] = []) => {
    if (query.includes('public.manifest_trash_restore_pending')) {
      if (query.includes('DELETE FROM')) {
        for (const path of params[1])
          callOrder.push(`pending_delete:${path}`)
        pendingPaths = pendingPaths.filter(path => !params[1].includes(path))
        return { rows: [], rowCount: params[1].length }
      }
      if (query.includes('UPDATE public.manifest_trash_restore_pending')) {
        pendingPaths = [...pendingPaths.filter(path => !params[1].includes(path)), ...pendingPaths.filter(path => params[1].includes(path))]
        return { rows: [], rowCount: params[1].length }
      }
      if (query.includes('SELECT EXISTS'))
        return { rows: [{ remaining: pendingPaths.length > 0 }] }
      return { rows: pendingPaths.slice(0, params[1]).map(s3_path => ({ s3_path })) }
    }
    if (query.includes('SELECT deleted'))
      return { rows: [{ deleted: true, deleted_at: null }] }
    if (query.includes('WITH batch AS')) {
      const removed = Math.min(rowsLeft, params[1])
      rowsLeft -= removed
      callOrder.push(`db_delete:${removed}`)
      return { rows: [], rowCount: removed }
    }
    if (query.includes('SELECT EXISTS'))
      return { rows: [{ remaining: rowsLeft > 0 }] }
    if (query.includes('WITH prev AS'))
      callOrder.push('finalize')
    return { rows: [], rowCount: 0 }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  callOrder.length = 0
  mockCleanupPg()
  moveObjectToTrash.mockResolvedValue(true)
  restoreObjectFromTrash.mockResolvedValue(true)
  createStatsMeta.mockResolvedValue({ error: null })
  appVersionsMetaSelectEq.mockReturnValue({ single: vi.fn(async () => ({ data: { size: 1234 }, error: null })) })
  appVersionsMetaUpdateEq.mockResolvedValue({ error: null })
})

describe('deleted version storage boundaries', () => {
  it('leaves shared and unreferenced delta objects intact and trashes only the canonical ZIP', async () => {
    mockCleanupPg(2)
    const response = await deleteIt(createContext(), createVersion({ manifest_count: 2 }))
    expect(response.status).toBe(200)
    expect(rowsLeft).toBe(0)
    expect(moveObjectToTrash.mock.calls.map(args => args[1])).toEqual([createVersion().r2_path])
    expect(deleteObject).not.toHaveBeenCalled()
    expect(restoreObjectFromTrash).not.toHaveBeenCalled()
    expect(channelsUpdate).toHaveBeenCalledTimes(2)
    expect(purgeFileReadCache).toHaveBeenCalledWith(createVersion().r2_path, createVersion().checksum)
    expect(appVersionsMetaUpdate).toHaveBeenCalledWith({ size: 0 })
    expect(createStatsMeta).toHaveBeenCalledWith(expect.anything(), 'com.cleanup.test', 123, -1234)
  })

  it('skips a noncanonical ZIP path', async () => {
    await deleteIt(createContext(), createVersion({ r2_path: 'orgs/org-1/apps/com.cleanup.test/9.9.9.zip' }))
    expect(moveObjectToTrash).not.toHaveBeenCalled()
  })

  it('trashes a retained source-org ZIP after ownership transfer', async () => {
    await deleteIt(createContext(), createVersion({ owner_org: 'org-2' }))
    expect(moveObjectToTrash).toHaveBeenCalledWith(expect.anything(), createVersion().r2_path)
  })

  it('clears manifest rows even when metadata is missing', async () => {
    mockCleanupPg(1)
    appVersionsMetaSelectEq.mockReturnValue({ single: vi.fn(async () => ({ data: null, error: { message: 'not found' } })) })
    await deleteIt(createContext(), createVersion({ manifest_count: 1 }))
    expect(rowsLeft).toBe(0)
    expect(moveObjectToTrash).toHaveBeenCalledTimes(1)
  })

  it.each(['false', 'throw'])('keeps ZIP failure retryable after database cleanup (%s)', async (failure) => {
    mockCleanupPg(1)
    moveObjectToTrash.mockImplementation(async () => {
      if (failure === 'throw')
        throw new Error('storage unavailable')
      return false
    })
    await expect(deleteIt(createContext(), createVersion())).rejects.toThrow('Cannot move S3 object for deleted version to trash')
    expect(rowsLeft).toBe(0)
    expect(callOrder).toContain('finalize')
    expect(closeClient).toHaveBeenCalledTimes(1)
  })

  it('routes zero-count deleted versions through legacy recovery on repeated updates', () => {
    const version = createVersion({ manifest_count: 0 })
    expect(onVersionUpdateTestUtils.getDeletedVersionAction(version, version)).toBe('cleanup_manifest')
    expect(onVersionUpdateTestUtils.getDeletedVersionAction(version, { ...version, deleted: false })).toBe('delete')
    expect(onVersionUpdateTestUtils.getDeletedVersionAction({ ...version, deleted: false, deleted_at: null }, version)).toBe('continue')
  })
})

describe('bounded pending recovery', () => {
  it('drains existing recovery before deleting rows, without creating new trash or recovery', async () => {
    mockCleanupPg(1, ['delta/recorded'])
    await onVersionUpdateTestUtils.deleteManifest(createContext(), createVersion())
    expect(restoreObjectFromTrash).toHaveBeenCalledWith(expect.anything(), 'delta/recorded')
    expect(pendingPaths).toEqual([])
    expect(callOrder.indexOf('pending_delete:delta/recorded')).toBeLessThan(callOrder.indexOf('db_delete:1'))
    expect(moveObjectToTrash).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
    expect(pgQuery.mock.calls.some(([query]) => query.includes('INSERT INTO'))).toBe(false)
  })

  it.each(['false', 'throw'])('retains failed recovery and all manifest tracking (%s)', async (failure) => {
    mockCleanupPg(1, ['delta/good', 'delta/failed'])
    restoreObjectFromTrash.mockImplementation(async (_c, path) => {
      if (path === 'delta/good')
        return true
      if (failure === 'throw')
        throw new Error('storage unavailable')
      return false
    })
    await expect(onVersionUpdateTestUtils.deleteManifest(createContext(), createVersion())).rejects.toThrow('Cannot restore re-referenced manifest file from trash')
    expect(rowsLeft).toBe(1)
    expect(pendingPaths).toEqual(['delta/failed'])
    expect(closeClient).toHaveBeenCalledTimes(1)
  })

  it('recovers pending-only versions with no manifest rows or count', async () => {
    mockCleanupPg(0, ['delta/recorded'])
    await onVersionUpdateTestUtils.deleteManifest(createContext(), createVersion())
    expect(restoreObjectFromTrash).toHaveBeenCalledTimes(1)
    expect(pendingPaths).toEqual([])
  })

  it('continues later waves after persistent failures and rotates failed batches', async () => {
    const failures = Array.from({ length: 100 }, (_, i) => `delta/failed-${i}`)
    mockCleanupPg(1, [...failures, 'delta/recoverable'])
    restoreObjectFromTrash.mockImplementation(async (_c, path) => path === 'delta/recoverable')
    await expect(onVersionUpdateTestUtils.deleteManifest(createContext(), createVersion())).rejects.toThrow('Cannot restore')
    expect(restoreObjectFromTrash).toHaveBeenCalledTimes(100)
    expect(pendingPaths[0]).toBe('delta/recoverable')
    await expect(onVersionUpdateTestUtils.deleteManifest(createContext(), createVersion())).rejects.toThrow('Cannot restore')
    expect(pendingPaths).not.toContain('delta/recoverable')
    expect(pendingPaths).toHaveLength(100)
    expect(rowsLeft).toBe(1)
  })

  it('bounds restore count and concurrency and resumes the next pass', async () => {
    mockCleanupPg(1, Array.from({ length: 101 }, (_, i) => `delta/${i}`))
    let active = 0
    let peak = 0
    restoreObjectFromTrash.mockImplementation(async () => {
      active++
      peak = Math.max(peak, active)
      await Promise.resolve()
      active--
      return true
    })
    await expect(onVersionUpdateTestUtils.deleteManifest(createContext(), createVersion())).rejects.toThrow('Pending manifest restores remain')
    expect(peak).toBe(10)
    expect(restoreObjectFromTrash).toHaveBeenCalledTimes(100)
    expect(pendingPaths).toHaveLength(1)
    expect(rowsLeft).toBe(1)
    await onVersionUpdateTestUtils.deleteManifest(createContext(), createVersion())
    expect(rowsLeft).toBe(0)
    expect(pendingPaths).toEqual([])
  })
})

describe('cleanup progress budget', () => {
  it('cleans a 5k bundle with five bounded transactions and one pool, making zero per-file R2 calls', async () => {
    mockCleanupPg(5000)
    await onVersionUpdateTestUtils.deleteManifest(createContext(), createVersion({ manifest_count: 5000 }))
    expect(rowsLeft).toBe(0)
    expect(drizzleTransaction).toHaveBeenCalledTimes(5)
    expect(getPgClient).toHaveBeenCalledExactlyOnceWith(expect.anything(), false)
    expect(closeClient).toHaveBeenCalledTimes(1)
    expect(manifestSelectWhere).not.toHaveBeenCalled()
    expect(moveObjectToTrash).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
    expect(restoreObjectFromTrash).not.toHaveBeenCalled()
    expect(pgQuery.mock.calls.filter(([query]) => query.includes('WITH batch AS')).every(([, params]) => params?.[1] === 1000)).toBe(true)
    expect(pgQuery.mock.calls.some(([query]) => query.includes('hashtext') || query.includes('COUNT(*)') || query.includes('other.app_version_id'))).toBe(false)
  })

  it('commits bounded progress and leaves counters for the next pass', async () => {
    mockCleanupPg(20_001)
    await expect(onVersionUpdateTestUtils.deleteManifest(createContext(), createVersion())).rejects.toThrow('Manifest cleanup budget exhausted')
    expect(rowsLeft).toBe(1)
    expect(callOrder).not.toContain('finalize')
    await onVersionUpdateTestUtils.deleteManifest(createContext(), createVersion())
    expect(rowsLeft).toBe(0)
    expect(callOrder.filter(value => value === 'finalize')).toHaveLength(1)
  })

  it('stops at the runtime budget after committed progress and always closes the pool', async () => {
    mockCleanupPg(5000)
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(10_000)
    try {
      await expect(onVersionUpdateTestUtils.deleteManifest(createContext(), createVersion())).rejects.toThrow('Manifest cleanup budget exhausted')
      expect(rowsLeft).toBe(4000)
      expect(closeClient).toHaveBeenCalledTimes(1)
      expect(callOrder).not.toContain('finalize')
    }
    finally {
      now.mockRestore()
    }
  })
})
