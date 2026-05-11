import { describe, expect, it } from 'vitest'
import { __discordTestUtils__ } from '../supabase/functions/_backend/utils/discord.ts'

describe('discord alert redaction', () => {
  it.concurrent('keeps raw request and error details out of 500 alert payloads', () => {
    const error = new Error('failed for alice@capgo.app with token super-secret-error-token')
    error.name = 'SensitiveError'
    error.stack = 'Error: failed\n    at secret-token-stack-frame'

    const payload = __discordTestUtils__.buildDiscordAlert500Payload({
      body: JSON.stringify({
        api_key: 'capg_super_secret_key',
        device_id: 'device-secret-id',
        email: 'alice@capgo.app',
        password: 'correct horse battery staple',
        token: 'body-token-secret',
      }),
      environment: 'production',
      error,
      functionName: 'privateEndpoint',
      hasClientIp: true,
      hasUserAgent: true,
      method: 'POST',
      rawHeaders: {
        'authorization': 'Bearer raw-authorization-token',
        'cookie': 'session=raw-cookie-value',
        'x-api-key': 'raw-api-key-value',
      },
      requestId: 'request-id',
      timestamp: '2026-05-11T00:00:00.000Z',
      url: 'https://api.capgo.app/functions/v1/secret-url-token?token=url-token&email=alice@capgo.app',
    })

    const serialized = JSON.stringify(payload)

    expect(serialized).toContain('**Path present:** yes')
    expect(serialized).toContain('**Path segments:** 3')
    expect(serialized).toContain('**Has query:** yes')
    expect(serialized).toContain('**Authorization present:** yes')
    expect(serialized).toContain('**Cookie present:** yes')
    expect(serialized).toContain('**API key present:** yes')
    expect(serialized).toContain('SensitiveError')
    expect(serialized).not.toContain('alice@capgo.app')
    expect(serialized).not.toContain('body-token-secret')
    expect(serialized).not.toContain('capg_super_secret_key')
    expect(serialized).not.toContain('correct horse battery staple')
    expect(serialized).not.toContain('device-secret-id')
    expect(serialized).not.toContain('raw-api-key-value')
    expect(serialized).not.toContain('raw-authorization-token')
    expect(serialized).not.toContain('raw-cookie-value')
    expect(serialized).not.toContain('secret-url-token')
    expect(serialized).not.toContain('secret-token-stack-frame')
    expect(serialized).not.toContain('url-token')
  })

  it.concurrent('summarizes disabled Discord payload logs without serializing payload content', () => {
    const metadata = __discordTestUtils__.getDiscordPayloadLogMetadata({
      content: 'contains token raw-token-value',
      embeds: [
        {
          description: 'contains password raw-password-value',
          title: 'sensitive payload',
        },
      ],
    } as any)

    const serialized = JSON.stringify(metadata)

    expect(metadata).toEqual({
      embedCount: 1,
      hasContent: true,
      payloadType: 'object',
    })
    expect(serialized).not.toContain('raw-token-value')
    expect(serialized).not.toContain('raw-password-value')
  })
})
