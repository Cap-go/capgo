import { afterEach, describe, expect, it, vi } from 'vitest'

import { getWebhookUrlValidationError, getWebhookUrlValidationErrorAsync } from '../supabase/functions/_backend/utils/webhook.ts'

const context = { env: {} } as any

function mockDnsAnswers(answers: string[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const recordType = new URL(url).searchParams.get('type')
    const data = recordType === 'A' || recordType === 'AAAA'
      ? answers.map(answer => ({ data: answer }))
      : []

    return new Response(JSON.stringify({ Answer: data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }))
}

describe('webhook URL validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps blocking direct IP webhook URLs', () => {
    expect(getWebhookUrlValidationError(context, 'https://127.0.0.1/webhook')).toBe('Webhook URL must use a hostname, not an IP address')
  })

  it('blocks hostnames that resolve to private network addresses', async () => {
    mockDnsAnswers(['10.0.0.5'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://internal.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it('allows hostnames that resolve to public addresses', async () => {
    mockDnsAnswers(['93.184.216.34'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://example.com/webhook'),
    )
      .resolves
      .toBeNull()
  })
})
