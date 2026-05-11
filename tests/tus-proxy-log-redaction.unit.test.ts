import { beforeEach, describe, expect, it, vi } from 'vitest'

const cloudlog = vi.fn()

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog,
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: (_c: unknown, key: string) => {
    if (key === 'SUPABASE_URL')
      return 'https://internal.supabase.test'
    if (key === 'SUPABASE_SERVICE_ROLE_KEY')
      return 'service-role-secret'
    throw new Error(`Unexpected env key: ${key}`)
  },
}))

function makeContext(options: {
  fileId?: string
  uploadId?: string
  headers?: Record<string, string>
} = {}) {
  const headers = new Headers(options.headers)

  return {
    get(key: string) {
      if (key === 'requestId')
        return 'request-redaction-test'
      if (key === 'fileId')
        return options.fileId
      return undefined
    },
    req: {
      raw: {
        body: null,
        headers,
      },
      header(name: string) {
        return headers.get(name) ?? undefined
      },
      param(name: string) {
        if (name === 'id')
          return options.uploadId
        return undefined
      },
    },
  }
}

describe('supabase TUS proxy log redaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps create-upload logs free of raw storage paths, metadata, and locations', async () => {
    const {
      supabaseTusCreateHandler,
    } = await import('../supabase/functions/_backend/files/supabaseTusProxy.ts')

    const rawFileId = 'orgs/org-secret/apps/app-secret/releases/private-build.zip'
    const uploadId = 'upload-secret-id'
    const supabaseLocation = `https://internal.supabase.test/storage/v1/upload/resumable/${uploadId}?token=secret-token`
    const publicHost = 'uploads.capgo-secret.test'
    const encodedFileId = btoa(rawFileId)
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 201,
      headers: {
        Location: supabaseLocation,
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await supabaseTusCreateHandler(makeContext({
      fileId: rawFileId,
      headers: {
        Host: 'localhost:54321',
        'X-Forwarded-Host': publicHost,
        'X-Forwarded-Proto': 'https',
      },
    }) as any)

    expect(response.status).toBe(201)
    expect(response.headers.get('Location')).toBe(`https://${publicHost}/functions/v1/files/upload/attachments/${uploadId}`)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.supabase.test/storage/v1/upload/resumable',
      expect.objectContaining({
        method: 'POST',
      }),
    )

    const serializedLogs = JSON.stringify(cloudlog.mock.calls)

    expect(serializedLogs).not.toContain(rawFileId)
    expect(serializedLogs).not.toContain(encodedFileId)
    expect(serializedLogs).not.toContain('internal.supabase.test')
    expect(serializedLogs).not.toContain(supabaseLocation)
    expect(serializedLogs).not.toContain(uploadId)
    expect(serializedLogs).not.toContain(publicHost)
    expect(serializedLogs).not.toContain('secret-token')
  })

  it('keeps patch and head logs free of raw upload IDs and upstream URLs', async () => {
    const {
      supabaseTusHeadHandler,
      supabaseTusPatchHandler,
    } = await import('../supabase/functions/_backend/files/supabaseTusProxy.ts')

    const uploadId = 'chunk-upload-secret-id'
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await supabaseTusPatchHandler(makeContext({ uploadId }) as any)
    await supabaseTusHeadHandler(makeContext({ uploadId }) as any)

    const serializedLogs = JSON.stringify(cloudlog.mock.calls)

    expect(serializedLogs).not.toContain(uploadId)
    expect(serializedLogs).not.toContain('internal.supabase.test')
    expect(serializedLogs).not.toContain(`/storage/v1/upload/resumable/${uploadId}`)
  })
})
