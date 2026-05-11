import { afterEach, describe, expect, it, vi } from 'vitest'

import { app, checkCpuUsageTestUtils } from '../supabase/functions/_backend/public/check_cpu_usage.ts'

const API_SECRET = 'test-secret'
const SMALL_GRAFANA_BODY = JSON.stringify({
  status: 'success',
  data: {
    result: [
      { value: [Date.now(), '12.34'] },
    ],
  },
})

function requestCheckCpuUsage() {
  return app.request('http://localhost/', {
    headers: {
      apisecret: API_SECRET,
    },
  })
}

function stubEnv() {
  vi.stubEnv('API_SECRET', API_SECRET)
  vi.stubEnv('GRAFANA_URL', 'https://grafana.example.com')
  vi.stubEnv('GRAFANA_TOKEN', 'token')
}

function responseStream(chunks: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function expectCpuCheckError(responseBody: BodyInit, error: string, status = 200, headers?: HeadersInit) {
  stubEnv()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => new Response(responseBody, { status, headers })))

  const response = await requestCheckCpuUsage()

  expect(response.status).toBe(502)
  await expect(response.json()).resolves.toMatchObject({ error })
}

describe('check_cpu_usage Grafana response limits', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects Grafana query responses with oversized content-length before parsing JSON', async () => {
    await expectCpuCheckError('{}', 'grafana_response_too_large', 200, {
      'content-length': String(129 * 1024),
    })
  })

  it('keeps the normal Grafana success path unchanged', async () => {
    stubEnv()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SMALL_GRAFANA_BODY)))

    const response = await requestCheckCpuUsage()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      cpu_usage_percent: 12.34,
      threshold_percent: 50,
    })
  })

  it('rejects chunked Grafana query responses after the size cap is exceeded', async () => {
    await expectCpuCheckError(responseStream([
      '{"status":"success","padding":"',
      'x'.repeat(129 * 1024),
      '"}',
    ]), 'grafana_response_too_large')
  })

  it('caps non-ok Grafana error bodies before logging them', async () => {
    const body = 'x'.repeat(4097)
    const response = new Response(responseStream([body]))

    await expect(checkCpuUsageTestUtils.readResponseTextWithLimit(response, 4096)).resolves.toBeNull()
  })

  it('caps non-ok Grafana error bodies on the endpoint path', async () => {
    stubEnv()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const oversizedBody = 'x'.repeat(4097)
    const fetchMock = vi.fn(async () => new Response(responseStream([oversizedBody]), { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await requestCheckCpuUsage()

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: 'grafana_request_failed',
    })
    expect(JSON.stringify(errorSpy.mock.calls)).toContain('response_body_too_large')
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(oversizedBody)
  })
})
