import { afterEach, describe, expect, it, vi } from 'vitest'
import { __queueConsumerTestUtils__, http_post_helper, MAX_QUEUE_READS, messagesArraySchema } from '../supabase/functions/_backend/triggers/queue_consumer.ts'
import { parseSchema } from '../supabase/functions/_backend/utils/ark_validation.ts'

describe('queue_consumer legacy message compatibility', () => {
  it.concurrent('uses the payload envelope when it is present', () => {
    const [message] = parseSchema(messagesArraySchema, [
      {
        msg_id: 1,
        read_ct: 0,
        message: {
          function_name: 'cron_sync_sub',
          function_type: 'cloudflare',
          payload: {
            orgId: 'org-1',
            customerId: 'cus_1',
          },
        },
      },
    ])

    expect(__queueConsumerTestUtils__.extractMessageBody(message!)).toEqual({
      orgId: 'org-1',
      customerId: 'cus_1',
    })
  })

  it.concurrent('falls back to legacy top-level fields when payload is missing', () => {
    const [message] = parseSchema(messagesArraySchema, [
      {
        msg_id: 2,
        read_ct: 0,
        message: {
          function_name: 'cron_sync_sub',
          orgId: 'org-legacy',
          customerId: 'cus_legacy',
        },
      },
    ])

    expect(__queueConsumerTestUtils__.extractMessageBody(message!)).toEqual({
      orgId: 'org-legacy',
      customerId: 'cus_legacy',
    })
  })

  it.concurrent('drops legacy routing metadata from fallback bodies', () => {
    const [message] = parseSchema(messagesArraySchema, [
      {
        msg_id: 3,
        read_ct: 0,
        message: {
          function_name: 'cron_sync_sub',
        },
      },
    ])

    expect(__queueConsumerTestUtils__.extractMessageBody(message!)).toEqual({})
  })

  it.concurrent('does not alert Discord while failed messages still have retries left', () => {
    expect(__queueConsumerTestUtils__.getActionableQueueFailures([
      {
        cf_id: 'cf-1',
        function_name: 'on_version_update',
        function_type: 'supabase',
        msg_id: 1,
        payload_size: 10,
        read_count: 1,
        status: 502,
        status_text: 'Bad Gateway',
      },
    ])).toEqual([])
  })

  it.concurrent('alerts Discord after retry budget is exhausted', () => {
    const failure = {
      cf_id: 'cf-1',
      error_code: 'internal_error',
      function_name: 'on_version_update',
      function_type: 'supabase',
      msg_id: 1,
      payload_size: 10,
      read_count: MAX_QUEUE_READS,
      status: 500,
      status_text: 'Internal Server Error',
    }

    expect(__queueConsumerTestUtils__.getActionableQueueFailures([failure])).toEqual([failure])
  })

  it.concurrent('keeps ignored queue errors out of Discord after retries are exhausted', () => {
    expect(__queueConsumerTestUtils__.getActionableQueueFailures([
      {
        cf_id: 'cf-1',
        error_code: 'version_not_found',
        function_name: 'on_version_update',
        function_type: 'supabase',
        msg_id: 1,
        payload_size: 10,
        read_count: MAX_QUEUE_READS,
        status: 400,
        status_text: 'Bad Request',
      },
    ])).toEqual([])
  })

  it.concurrent('summarizes queued POST logs without raw payload values', () => {
    const payload = {
      customerId: 'cus_secret_123',
      email: 'alice@capgo.app',
      token: 'sk_live_secret_123',
    }
    const metadata = __queueConsumerTestUtils__.getQueuePostLogMetadata('cron_sync_sub', 'cloudflare', payload)
    const serializedMetadata = JSON.stringify(metadata)

    expect(metadata).toMatchObject({
      functionName: 'cron_sync_sub',
      payloadKeys: 3,
      payloadSize: JSON.stringify(payload).length,
      payloadType: 'object',
      targetKind: 'cloudflare',
    })
    expect(serializedMetadata).not.toContain('alice@capgo.app')
    expect(serializedMetadata).not.toContain('cus_secret_123')
    expect(serializedMetadata).not.toContain('sk_live_secret_123')
    expect(serializedMetadata).not.toContain('customerId')
    expect(serializedMetadata).not.toContain('email')
    expect(serializedMetadata).not.toContain('token')
  })

  it.concurrent('classifies queued POST targets without exposing configured URLs', () => {
    expect(__queueConsumerTestUtils__.getQueuePostTargetKind('cloudflare_pp', 'https://pp.example.com', 'https://cf.example.com')).toBe('cloudflare_pp')
    expect(__queueConsumerTestUtils__.getQueuePostTargetKind('cloudflare', 'https://pp.example.com', 'https://cf.example.com')).toBe('cloudflare')
    expect(__queueConsumerTestUtils__.getQueuePostTargetKind('', '', 'https://cf.example.com')).toBe('cloudflare_legacy')
    expect(__queueConsumerTestUtils__.getQueuePostTargetKind('cloudflare', '', '')).toBe('supabase')
  })

  it.concurrent('redacts sensitive data before queue failures are sent to Discord', () => {
    const sanitized = __queueConsumerTestUtils__.sanitizeDiscordResponseBody(JSON.stringify({
      authorization: 'Bearer abcdefghijklmnopqrstuvwxyz1234567890',
      email: 'alice@capgo.app',
      stack: 'Error: builder unavailable',
      token: 'super-secret-token-value',
      traceId: 'ABCDEF0123456789ABCDEF0123456789',
    }))

    expect(sanitized).toContain('[REDACTED_EMAIL]')
    expect(sanitized).toContain('[REDACTED_TOKEN]')
    expect(sanitized).toContain('[REDACTED]')
    expect(sanitized).not.toContain('alice@capgo.app')
    expect(sanitized).not.toContain('super-secret-token-value')
    expect(sanitized).toContain('builder unavailable')
  })

  it.concurrent('keeps message-only JSON error details actionable', async () => {
    const response = new Response(JSON.stringify({
      message: 'builder unavailable',
    }), {
      headers: {
        'content-type': 'application/json',
      },
      status: 503,
      statusText: 'Service Unavailable',
    })

    await expect(__queueConsumerTestUtils__.extractErrorDetails(response)).resolves.toEqual({
      bodyPreview: '{"message":"builder unavailable"}',
      errorCode: null,
      errorMessage: 'builder unavailable',
    })
  })

  it.concurrent('redacts sensitive data from extracted JSON error messages', async () => {
    const token = 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGH'
    const response = new Response(JSON.stringify({
      message: `invalid token ${token} for user alice@capgo.app`,
    }), {
      headers: {
        'content-type': 'application/json',
      },
      status: 401,
      statusText: 'Unauthorized',
    })

    const details = await __queueConsumerTestUtils__.extractErrorDetails(response)

    expect(details.errorMessage).toBe('invalid token [REDACTED_TOKEN] for user [REDACTED_EMAIL]')
    expect(details.errorMessage).not.toContain(token)
    expect(details.errorMessage).not.toContain('alice@capgo.app')
  })
})

describe('queue_consumer HTTP POST helper timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('aborts slow queue POST targets after the timeout elapses', async () => {
    vi.useFakeTimers()

    const body = { queued: true }
    let capturedSignal: AbortSignal | undefined
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const signal = init?.signal as AbortSignal | undefined
      capturedSignal = signal
      if (!signal)
        return Promise.reject(new Error('missing abort signal'))

      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })
    })

    const context = {
      env: {
        API_SECRET: 'test-api-secret',
        CLOUDFLARE_FUNCTION_URL: '',
        CLOUDFLARE_PP_FUNCTION_URL: '',
        SUPABASE_URL: 'https://supabase.example.com',
      },
      get: (key: string) => key === 'requestId' ? 'req-queue-timeout' : undefined,
    }

    const request = http_post_helper(context as any, 'slow_function', 'supabase', body, 'cf-1')
      .then(
        () => undefined,
        (error: unknown) => error,
      )

    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(capturedSignal?.aborted).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify(body),
      method: 'POST',
      signal: capturedSignal,
    }))

    await vi.advanceTimersByTimeAsync(15000)

    expect(capturedSignal?.aborted).toBe(true)
    const error = await request
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Request Timeout (Internal QUEUE handling error)')
  })
})
