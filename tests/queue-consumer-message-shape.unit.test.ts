import { describe, expect, it } from 'vitest'
import { __queueConsumerTestUtils__, messagesArraySchema } from '../supabase/functions/_backend/triggers/queue_consumer.ts'

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
})
