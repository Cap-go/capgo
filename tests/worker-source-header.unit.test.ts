import { afterAll, describe, expect, it, vi } from 'vitest'
import { createHono } from '../supabase/functions/_backend/utils/hono.ts'
import { version } from '../supabase/functions/_backend/utils/version.ts'

describe('worker source headers', () => {
  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it.concurrent('exposes the Cloudflare Worker deployment version when metadata is bound', async () => {
    vi.stubEnv('ENV_NAME', 'capgo_api-prod')
    const app = createHono('api', version)
    app.get('/ok', c => c.json({ status: 'ok' }))

    const response = await app.fetch(
      new Request('http://localhost/ok'),
      {
        CF_VERSION_METADATA: {
          id: '02af90ed-1d5a-474c-9afd-aa2eb41a14ac',
          tag: 'deploy-prod',
          timestamp: '2026-05-11T13:58:16.307Z',
        },
      },
    )

    expect(response.headers.get('x-worker-source')).toBe(`capgo_api-prod-${version}`)
    expect(response.headers.get('x-worker-version-id')).toBe('02af90ed-1d5a-474c-9afd-aa2eb41a14ac')
    expect(response.headers.get('x-worker-version-tag')).toBe('deploy-prod')
    expect(response.headers.get('x-worker-version-timestamp')).toBe('2026-05-11T13:58:16.307Z')
  })

  it.concurrent('keeps the existing source header when version metadata is not available', async () => {
    vi.stubEnv('ENV_NAME', 'capgo_api-prod')
    const app = createHono('api', version)
    app.get('/ok', c => c.json({ status: 'ok' }))

    const response = await app.fetch(
      new Request('http://localhost/ok'),
      {},
    )

    expect(response.headers.get('x-worker-source')).toBe(`capgo_api-prod-${version}`)
    expect(response.headers.get('x-worker-version-id')).toBeNull()
  })
})
