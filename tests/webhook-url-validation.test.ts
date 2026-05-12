import { afterEach, describe, expect, it, vi } from 'vitest'

import { deliverWebhook, getWebhookUrlValidationError, getWebhookUrlValidationErrorAsync } from '../supabase/functions/_backend/utils/webhook.ts'

const context = { env: {}, get: () => 'test-request-id' } as any

function mockDnsAnswers(answers: string[], options: { status?: number } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const recordType = new URL(url).searchParams.get('type')
    const data = recordType === 'A' || recordType === 'AAAA'
      ? answers.map(answer => ({ data: answer }))
      : []

    return new Response(JSON.stringify({ Answer: data }), {
      status: options.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }))
}

function mockDnsThenDelivery(answers: string[], deliveryResponse: Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('https://cloudflare-dns.com/')) {
      const recordType = new URL(url).searchParams.get('type')
      const data = recordType === 'A' || recordType === 'AAAA'
        ? answers.map(answer => ({ data: answer }))
        : []

      return new Response(JSON.stringify({ Answer: data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    return deliveryResponse
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

  it('blocks hostnames with both public and private DNS answers', async () => {
    mockDnsAnswers(['93.184.216.34', '192.168.1.10'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://mixed.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it('blocks multicast and reserved IPv4 answers', async () => {
    mockDnsAnswers(['224.0.0.1', '240.0.0.1'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://reserved.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it('blocks IPv6 link-local addresses across fe80::/10', async () => {
    mockDnsAnswers(['fea0::1'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://link-local.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it('allows public IPv4-mapped IPv6 answers encoded as hex pairs', async () => {
    mockDnsAnswers(['::ffff:0808:0808'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://mapped.example.com/webhook'),
    )
      .resolves
      .toBeNull()
  })

  it('fails closed when the DNS resolver returns no answers', async () => {
    mockDnsAnswers([])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://empty.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL host could not be resolved')
  })

  it('fails closed when the DNS resolver returns an error status', async () => {
    mockDnsAnswers([], { status: 503 })

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://dns-error.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL host could not be resolved')
  })

  it('allows hostnames that resolve to public addresses', async () => {
    mockDnsAnswers(['93.184.216.34'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://example.com/webhook'),
    )
      .resolves
      .toBeNull()
  })

  it('does not follow webhook delivery redirects', async () => {
    mockDnsThenDelivery(['93.184.216.34'], new Response('', {
      status: 302,
      headers: { Location: 'http://127.0.0.1/internal' },
    }))

    const result = await deliverWebhook(
      context,
      'delivery-id',
      'https://example.com/webhook',
      {
        event: 'apps.INSERT',
        event_id: 'event-id',
        timestamp: '2026-05-12T00:00:00.000Z',
        org_id: 'org-id',
        data: {
          table: 'apps',
          operation: 'INSERT',
          record_id: 'app-id',
          old_record: null,
          new_record: null,
          changed_fields: null,
        },
      },
      'secret',
    )

    expect(result).toMatchObject({ success: false, status: 302 })
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]).toMatchObject({ redirect: 'manual' })
  })
})
