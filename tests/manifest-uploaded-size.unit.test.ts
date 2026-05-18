import { beforeEach, describe, expect, it, vi } from 'vitest'

const closeClientMock = vi.fn()
const getPgClientMock = vi.fn()
const supabaseAdminMock = vi.fn()

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient: closeClientMock,
  getDrizzleClient: vi.fn(),
  getPgClient: getPgClientMock,
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: supabaseAdminMock,
}))

vi.mock('../supabase/functions/_backend/utils/stats.ts', () => ({
  createStatsMeta: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/s3.ts', () => ({
  getPath: vi.fn(),
  s3: {
    deleteObject: vi.fn(),
    getSize: vi.fn(),
  },
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'req-test' : undefined,
    json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  } as any
}

describe('manifest uploaded file sizes', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it.concurrent('hydrates manifest file_size from backend-observed upload rows only', async () => {
    const uploadedSizesClient = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              file_size: '1234',
              s3_path: 'orgs/org-1/apps/com.test.app/delta/trusted.js',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    }
    getPgClientMock.mockReturnValue(uploadedSizesClient)

    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const manifestLimitMock = vi.fn().mockResolvedValue({ data: [] })
    const appVersionEqMock = vi.fn().mockResolvedValue({ error: null })

    supabaseAdminMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'manifest') {
          return {
            insert: insertMock,
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: manifestLimitMock,
              })),
            })),
          }
        }

        if (table === 'app_versions') {
          return {
            update: vi.fn(() => ({
              eq: appVersionEqMock,
            })),
          }
        }

        throw new Error(`unexpected table ${table}`)
      }),
    })

    const { onVersionUpdateTestUtils } = await import('../supabase/functions/_backend/triggers/on_version_update.ts')

    await onVersionUpdateTestUtils.handleManifest(createContext(), {
      app_id: 'com.test.app',
      id: 42,
      manifest: [
        {
          file_hash: 'hash-trusted',
          file_name: 'trusted.js',
          file_size: 999999999,
          s3_path: 'orgs/org-1/apps/com.test.app/delta/trusted.js',
        },
        {
          file_hash: 'hash-missing',
          file_name: 'missing.js',
          file_size: 888888888,
          s3_path: 'orgs/org-1/apps/com.test.app/delta/missing.js',
        },
      ],
    } as any)

    expect(insertMock).toHaveBeenCalledWith([
      {
        app_version_id: 42,
        file_hash: 'hash-trusted',
        file_name: 'trusted.js',
        file_size: 1234,
        s3_path: 'orgs/org-1/apps/com.test.app/delta/trusted.js',
      },
      {
        app_version_id: 42,
        file_hash: 'hash-missing',
        file_name: 'missing.js',
        file_size: 0,
        s3_path: 'orgs/org-1/apps/com.test.app/delta/missing.js',
      },
    ])
    expect(uploadedSizesClient.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM public.uploaded_file_sizes'),
      [[
        'orgs/org-1/apps/com.test.app/delta/trusted.js',
        'orgs/org-1/apps/com.test.app/delta/missing.js',
      ]],
    )
  })
})
