import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { deliverWebhook, getWebhookUrlValidationError, getWebhookUrlValidationErrorAsync } from '../supabase/functions/_backend/utils/webhook.ts'

const context = { env: {}, get: () => 'test-request-id' } as any
const dnsAnswers = new Map<string, { answers: string[], status: number }>()
const deliveryResponses = new Map<string, Response>()

function mockDnsAnswers(hostname: string, answers: string[], options: { status?: number } = {}) {
  dnsAnswers.set(hostname, {
    answers,
    status: options.status ?? 200,
  })
}

function mockDnsThenDelivery(hostname: string, answers: string[], deliveryUrl: string, deliveryResponse: Response) {
  mockDnsAnswers(hostname, answers)
  deliveryResponses.set(deliveryUrl, deliveryResponse)
}

describe('webhook URL validation', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (!url.startsWith('https://cloudflare-dns.com/')) {
        const response = deliveryResponses.get(url)
        if (response)
          return response

        return new Response('', { status: 404 })
      }

      const hostname = new URL(url).searchParams.get('name') ?? ''
      const record = dnsAnswers.get(hostname) ?? { answers: [], status: 200 }
      const recordType = new URL(url).searchParams.get('type')
      const data = recordType === 'A' || recordType === 'AAAA'
        ? record.answers.map(answer => ({ data: answer }))
        : []

      return new Response(JSON.stringify({ Answer: data }), {
        status: record.status,
        headers: { 'content-type': 'application/json' },
      })
    }))
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it.concurrent('keeps blocking direct IP webhook URLs', () => {
    expect(getWebhookUrlValidationError(context, 'https://127.0.0.1/webhook')).toBe('Webhook URL must use a hostname, not an IP address')
  })

  it.concurrent('blocks hostnames that resolve to private network addresses', async () => {
    mockDnsAnswers('internal.example.com', ['10.0.0.5'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://internal.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it.concurrent('blocks hostnames with both public and private DNS answers', async () => {
    mockDnsAnswers('mixed.example.com', ['93.184.216.34', '192.168.1.10'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://mixed.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it.concurrent('blocks multicast and reserved IPv4 answers', async () => {
    mockDnsAnswers('reserved.example.com', ['224.0.0.1', '240.0.0.1'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://reserved.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it.concurrent('blocks IPv6 link-local addresses across fe80::/10', async () => {
    mockDnsAnswers('link-local.example.com', ['fea0::1'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://link-local.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it.concurrent('blocks IPv6 discard-only prefix 100::/64 in abbreviated forms', async () => {
    mockDnsAnswers('discard.example.com', ['100::1', '0100::'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://discard.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it.concurrent('blocks IPv6 NAT64 prefix 64:ff9b::/96 with leading zeros', async () => {
    mockDnsAnswers('nat64.example.com', ['64:ff9b::1234:5678', '0064:ff9b::8888:8888'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://nat64.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it.concurrent('blocks IPv6 documentation prefix 2001:db8::/32 with leading zeros', async () => {
    mockDnsAnswers('docs.example.com', ['2001:db8::1', '2001:0db8::'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://docs.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it.concurrent('blocks IPv6 multicast addresses ff00::/8', async () => {
    mockDnsAnswers('multicast.example.com', ['ff02::1', 'ff00::'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://multicast.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL must point to a public host')
  })

  it.concurrent('allows public IPv4-mapped IPv6 answers encoded as hex pairs', async () => {
    mockDnsAnswers('mapped.example.com', ['::ffff:0808:0808'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://mapped.example.com/webhook'),
    )
      .resolves
      .toBeNull()
  })

  it.concurrent('fails closed when the DNS resolver returns no answers', async () => {
    mockDnsAnswers('empty.example.com', [])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://empty.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL host could not be resolved')
  })

  it.concurrent('fails closed when the DNS resolver returns an error status', async () => {
    mockDnsAnswers('dns-error.example.com', [], { status: 503 })

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://dns-error.example.com/webhook'),
    )
      .resolves
      .toBe('Webhook URL host could not be resolved')
  })

  it.concurrent('allows hostnames that resolve to public addresses', async () => {
    mockDnsAnswers('example.com', ['93.184.216.34'])

    await expect(
      getWebhookUrlValidationErrorAsync(context, 'https://example.com/webhook'),
    )
      .resolves
      .toBeNull()
  })

  it.concurrent('does not follow webhook delivery redirects', async () => {
    const deliveryUrl = 'https://redirect.example.com/webhook'
    mockDnsThenDelivery('redirect.example.com', ['93.184.216.34'], deliveryUrl, new Response('', {
      status: 302,
      headers: { Location: 'http://127.0.0.1/internal' },
    }))

    const result = await deliverWebhook(
      context,
      'delivery-id',
      deliveryUrl,
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
    const deliveryCall = vi.mocked(fetch).mock.calls.find(([url]) => url === deliveryUrl)
    expect(deliveryCall?.[1]).toMatchObject({ redirect: 'manual' })
  })
})
