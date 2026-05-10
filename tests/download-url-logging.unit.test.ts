import { beforeEach, describe, expect, it, vi } from 'vitest'

const { cloudlogMock, cloudlogErrMock, getSignedUrlMock } = vi.hoisted(() => ({
  cloudlogMock: vi.fn(),
  cloudlogErrMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
}))

vi.mock('hono/adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('hono/adapter')>()
  return {
    ...actual,
    getRuntimeKey: () => 'node',
  }
})

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
  cloudlogErr: cloudlogErrMock,
}))

vi.mock('../supabase/functions/_backend/utils/s3.ts', () => ({
  s3: {
    getSignedUrl: getSignedUrlMock,
  },
}))

describe('download URL logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not write presigned bundle URLs to logs', async () => {
    const signedUrl = 'https://storage.example/bundle.zip?X-Amz-Signature=secret-token'
    getSignedUrlMock.mockResolvedValue(signedUrl)

    const { getBundleUrl } = await import('../supabase/functions/_backend/utils/downloadUrl.ts')

    const context = {
      get: vi.fn(() => 'request-id'),
      req: {
        url: 'https://api.example/updates',
        header: vi.fn(),
      },
    }

    await expect(getBundleUrl(context as any, 'orgs/org-1/apps/app-1/bundle.zip', 'device-1', 'checksum-1')).resolves.toBe(signedUrl)

    const downloadUrlLog = cloudlogMock.mock.calls[1]?.[0]
    expect(downloadUrlLog).toHaveProperty('hasDownloadUrl', true)
    expect(downloadUrlLog).toHaveProperty('source', 's3')

    const loggedPayload = JSON.stringify(downloadUrlLog)
    expect(loggedPayload).not.toContain(signedUrl)
    expect(loggedPayload).not.toContain('secret-token')
  })
})
