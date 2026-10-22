import type { CapgoClient } from '../src/utils.ts'
import { describe, expect, it } from 'bun:test'
import { checkVersionNotUsedInChannel } from '../src/api/channels.ts'
import { cleanupAppVersions, deleteSpecificVersion, getLatestAppVersion, getVersionData, getVersionDataById } from '../src/api/versions.ts'
import { CliUserError } from '../src/shared/cli-user-error.ts'

interface InvokeCall {
  path: string
  method: string
  body: unknown
}

function makeBundleApiError(payload: { error: string, message: string }, status: number) {
  const response = new Response(JSON.stringify(payload), { status })
  return Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: response })
}

function recordingInvoke(responses: Array<{ data: unknown, error: Error | null }>) {
  const calls: InvokeCall[] = []
  const invoke = (async (path: string, options: { method: string, body: unknown }) => {
    calls.push({ path, method: options.method, body: options.body })
    const response = responses.shift()
    if (!response)
      throw new Error(`unexpected request ${options.method} ${path}`)
    return response
  }) as any
  return { calls, invoke }
}

const client = {} as CapgoClient
const bundleRow = { id: 7, name: '1.2.3', app_id: 'com.test.app', created_at: '2024-01-01T00:00:00.000Z', deleted: false }

describe('bundle lookups use one filtered request', () => {
  it('getVersionData filters by name instead of paging every bundle', async () => {
    const { calls, invoke } = recordingInvoke([{ data: [bundleRow], error: null }])
    const row = await getVersionData('key', 'com.test.app', '1.2.3', { silent: true, invoke })
    expect(row.id).toBe(7)
    expect(calls).toHaveLength(1)
    const url = new URL(calls[0].path, 'https://example.test/')
    expect(url.searchParams.get('version')).toBe('1.2.3')
    expect(url.searchParams.has('page')).toBe(false)
  })

  it('getVersionData reports a missing bundle as a CliUserError', async () => {
    const { invoke } = recordingInvoke([{ data: [], error: null }])
    await expect(getVersionData('key', 'com.test.app', '9.9.9', { silent: true, invoke }))
      .rejects
      .toThrow(CliUserError)
  })

  it('getVersionDataById filters by id', async () => {
    const { calls, invoke } = recordingInvoke([{ data: [bundleRow], error: null }])
    const row = await getVersionDataById('key', 'com.test.app', 7, { silent: true, invoke })
    expect(row?.name).toBe('1.2.3')
    expect(calls).toHaveLength(1)
    expect(new URL(calls[0].path, 'https://example.test/').searchParams.get('id')).toBe('7')
  })

  it('getLatestAppVersion reads a single one-row page', async () => {
    const { calls, invoke } = recordingInvoke([{ data: [{ ...bundleRow, id: 100 }], error: null }])
    const row = await getLatestAppVersion('key', 'com.test.app', { silent: true, invoke })
    expect(row?.id).toBe(100)
    expect(calls).toHaveLength(1)
    const url = new URL(calls[0].path, 'https://example.test/')
    expect(url.searchParams.get('page')).toBe('0')
    expect(url.searchParams.get('limit')).toBe('1')
  })
})

describe('deleteSpecificVersion', () => {
  it('deletes with a single request to the CLI delete endpoint', async () => {
    const { calls, invoke } = recordingInvoke([{ data: { id: 7, name: '1.2.3' }, error: null }])
    await deleteSpecificVersion(client, 'com.test.app', '1.2.3', { silent: true, apikey: 'key', invoke })
    expect(calls).toEqual([{ path: 'private/cli/bundles/delete', method: 'POST', body: { app_id: 'com.test.app', name: '1.2.3' } }])
  })

  it('reports a missing bundle from the single request', async () => {
    const { calls, invoke } = recordingInvoke([
      { data: null, error: makeBundleApiError({ error: 'bundle_not_found', message: 'Bundle not found' }, 404) },
    ])
    await expect(deleteSpecificVersion(client, 'com.test.app', '9.9.9', { silent: true, apikey: 'key', invoke }))
      .rejects
      .toThrow('App version com.test.app@9.9.9 doesn\'t exist')
    expect(calls).toHaveLength(1)
  })

  it('reports a backend without the endpoint as unsupported, not as a missing app', async () => {
    const { invoke } = recordingInvoke([{ data: null, error: makeBundleApiError({ error: 'not_found', message: 'Not Found' }, 404) }])
    await expect(deleteSpecificVersion(client, 'com.test.app', '1.2.3', { silent: true, apikey: 'key', invoke }))
      .rejects
      .toThrow(/does not support the CLI bundle delete endpoint/)
  })

  it('surfaces a linked refusal without a bundle id as a delete error', async () => {
    const { calls, invoke } = recordingInvoke([{
      data: null,
      error: makeBundleApiError({ error: 'bundle_linked', message: 'Bundle is linked to a channel' }, 409),
    }])
    await expect(deleteSpecificVersion(client, 'com.test.app', '1.2.3', { silent: true, apikey: 'key', invoke }))
      .rejects
      .toThrow(/Could not delete bundle for app com\.test\.app: bundle_linked/)
    expect(calls).toHaveLength(1)
  })

  it('surfaces database failures as delete errors', async () => {
    const { invoke } = recordingInvoke([{ data: null, error: makeBundleApiError({ error: 'cannot_get_bundle', message: 'Cannot get bundle' }, 400) }])
    await expect(deleteSpecificVersion(client, 'com.test.app', '1.2.3', { silent: true, apikey: 'key', invoke }))
      .rejects
      .toThrow(/Could not delete bundle for app com\.test\.app: cannot_get_bundle/)
  })

  it('surfaces permission errors', async () => {
    const { invoke } = recordingInvoke([{
      data: null,
      error: makeBundleApiError({ error: 'cannot_delete_bundle', message: 'You can\'t delete bundles of this app' }, 403),
    }])
    await expect(deleteSpecificVersion(client, 'com.test.app', '1.2.3', { silent: true, apikey: 'key', invoke }))
      .rejects
      .toThrow(/Cannot delete bundles for app com\.test\.app/)
  })
})

describe('cleanupAppVersions', () => {
  it('sends the whole cleanup to the API in one request', async () => {
    const result = { active: 3, total: 3, kept: [{ id: 3, name: '1.0.2', created_at: null, linked: false }], removed: [{ id: 1, name: '1.0.0', created_at: null, linked: false }], dry_run: true }
    const { calls, invoke } = recordingInvoke([{ data: result, error: null }])
    const data = await cleanupAppVersions('com.test.app', { keep: 1, bundle: '1.0.0', ignoreChannel: true, dryRun: true }, { apikey: 'key', silent: true, invoke })
    expect(data).toEqual(result)
    expect(calls).toEqual([{
      path: 'bundle/cleanup',
      method: 'POST',
      body: { app_id: 'com.test.app', keep: 1, bundle: '1.0.0', ignore_channel: true, dry_run: true },
    }])
  })

  it('sends the confirmed ids with the execute request', async () => {
    const { calls, invoke } = recordingInvoke([{ data: { active: 2, total: 2, kept: [], removed: [], dry_run: false }, error: null }])
    await cleanupAppVersions('com.test.app', { keep: 1, dryRun: false, ids: [4, 5] }, { apikey: 'key', silent: true, invoke })
    expect(calls[0].body).toEqual({ app_id: 'com.test.app', keep: 1, ignore_channel: false, dry_run: false, ids: [4, 5] })
  })

  it('reports a missing cleanup route as an unsupported API, not a missing app', async () => {
    const { invoke } = recordingInvoke([{ data: null, error: makeBundleApiError({ error: 'not_found', message: 'Not Found' }, 404) }])
    await expect(cleanupAppVersions('com.test.app', { keep: 1, dryRun: true }, { apikey: 'key', silent: true, invoke }))
      .rejects
      .toThrow(/does not support server-side bundle cleanup/)
  })

  it('rejects an unexpected response shape', async () => {
    const { invoke } = recordingInvoke([{ data: { status: 'ok' }, error: null }])
    await expect(cleanupAppVersions('com.test.app', { keep: 1, dryRun: false }, { apikey: 'key', silent: true, invoke }))
      .rejects
      .toThrow(/unexpected response/)
  })
})

describe('checkVersionNotUsedInChannel', () => {
  it('asks the API only for channels linked to the bundle', async () => {
    const urls: string[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request) => {
      urls.push(String(input))
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
    try {
      const target = { apikey: 'key', apiHost: 'http://127.0.0.1:9' } as CapgoClient
      await checkVersionNotUsedInChannel(target, 'com.test.app', bundleRow as any, { silent: true, apikey: 'key' })
    }
    finally {
      globalThis.fetch = originalFetch
    }
    expect(urls).toHaveLength(1)
    const url = new URL(urls[0])
    expect(url.pathname).toEndWith('/private/cli/channels')
    expect(url.searchParams.get('linked_version_id')).toBe('7')
  })
})
