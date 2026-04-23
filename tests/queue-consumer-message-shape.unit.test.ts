import { describe, expect, it } from 'vitest'
import { __queueConsumerTestUtils__, MAX_QUEUE_READS, messagesArraySchema } from '../supabase/functions/_backend/triggers/queue_consumer.ts'

describe('queue_consumer legacy message compatibility', () => {
  it.concurrent('uses the payload envelope when it is present', () => {
    const [message] = messagesArraySchema.parse([
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
    const [message] = messagesArraySchema.parse([
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
    const [message] = messagesArraySchema.parse([
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
})
