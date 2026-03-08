import { HTTPException } from 'hono/http-exception'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tusProxy } from '../supabase/functions/_backend/public/build/upload.ts'

const mockSupabaseApikey = vi.fn()
const mockCheckPermission = vi.fn()
const mockGetEnv = vi.fn()

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseApikey: mockSupabaseApikey,
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: mockCheckPermission,
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: mockGetEnv,
}))

describe('build upload proxy security', () => {
  const jobId = 'job-traversal-test'
  const appId = 'com.test.traversal.app'
  const orgId = 'org-traversal'
  const validUploadPath = `orgs/${orgId}/apps/${appId}/native-builds/file.zip`
  const buildRequestQuery = {
    data: {
      app_id: appId,
      owner_org: orgId,
      builder_job_id: jobId,
      upload_path: validUploadPath,
    },
    error: null,
  }

  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(buildRequestQuery),
  }

  const fakeContext = (url: string, method = 'POST') => {
    const request = new Request(url, {
      method,
      headers: {
        'Tus-Resumable': '1.0.0',
      },
    })

    return {
      req: {
        url: request.url,
        method: request.method,
        raw: request,
        header: (name: string) => request.headers.get(name),
      },
      get: vi.fn().mockReturnValue('test-request-id'),
    }
  }

  afterEach(() => {
    vi.clearAllMocks()
    queryBuilder.select.mockClear()
    queryBuilder.eq.mockClear()
    queryBuilder.single.mockClear()
  })

  it('rejects path traversal attempts before forwarding to builder', async () => {
    mockGetEnv.mockImplementation((_, key: string) => {
      if (key === 'BUILDER_URL') {
        return 'https://builder.capgo.app'
      }
      if (key === 'BUILDER_API_KEY') {
        return 'builder-secret'
      }
      return null
    })
    mockCheckPermission.mockResolvedValue(true)
    mockSupabaseApikey.mockReturnValue({
      from: vi.fn().mockReturnValue(queryBuilder),
    })

    const context = fakeContext(`http://localhost/build/upload/${jobId}/../jobs`, 'PATCH')

    const responsePromise = tusProxy(context as any, jobId, { user_id: 'user-test', key: 'api-test' } as any)
    const error = await expect(responsePromise).rejects.toBeInstanceOf(HTTPException)

    expect(error.cause).toMatchObject({
      error: 'invalid_path',
      message: 'Invalid upload path',
    })
  })

  it('rejects invalidly encoded paths before forwarding to builder', async () => {
    mockGetEnv.mockImplementation((_, key: string) => {
      if (key === 'BUILDER_URL') {
        return 'https://builder.capgo.app'
      }
      if (key === 'BUILDER_API_KEY') {
        return 'builder-secret'
      }
      return null
    })
    mockCheckPermission.mockResolvedValue(true)
    mockSupabaseApikey.mockReturnValue({
      from: vi.fn().mockReturnValue(queryBuilder),
    })

    const context = fakeContext(`http://localhost/build/upload/${jobId}/%`, 'PATCH')

    const responsePromise = tusProxy(context as any, jobId, { user_id: 'user-test', key: 'api-test' } as any)
    const error = await expect(responsePromise).rejects.toBeInstanceOf(HTTPException)

    expect(error.cause).toMatchObject({
      error: 'invalid_path',
      message: 'Invalid upload path encoding.',
    })
  })

  it('does not reject canonical upload suffixes', async () => {
    mockGetEnv.mockImplementation((_, key: string) => {
      if (key === 'BUILDER_URL') {
        return 'https://builder.capgo.app'
      }
      if (key === 'BUILDER_API_KEY') {
        return 'builder-secret'
      }
      return null
    })
    mockCheckPermission.mockResolvedValue(true)
    mockSupabaseApikey.mockReturnValue({
      from: vi.fn().mockReturnValue(queryBuilder),
    })

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
      status: 201,
      headers: {
        Location: 'https://builder.capgo.app/upload/file.zip',
      },
    }))

    const context = fakeContext(`http://localhost/build/upload/${jobId}/artifact.zip`, 'PATCH')
    const response = await tusProxy(context as any, jobId, { user_id: 'user-test', key: 'api-test' } as any)

    expect(response.status).toBe(201)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://builder.capgo.app/upload/artifact.zip',
      expect.anything(),
    )
  })
})
