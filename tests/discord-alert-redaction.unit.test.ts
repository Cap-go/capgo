import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cloudlogErrMock,
  cloudlogMock,
  envState,
  fetchMock,
} = vi.hoisted(() => ({
  cloudlogErrMock: vi.fn(),
  cloudlogMock: vi.fn(),
  envState: {
    discordAlert: '',
  },
  fetchMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
  cloudlogErr: cloudlogErrMock,
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: (_c: unknown, key: string) => {
    if (key === 'DISCORD_ALERT')
      return envState.discordAlert
    if (key === 'ENVIRONMENT')
      return 'production'
    return ''
  },
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

beforeEach(() => {
  envState.discordAlert = ''
  fetchMock.mockReset()
  cloudlogErrMock.mockReset()
  cloudlogMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('discord alert redaction', () => {
  it('keeps raw request and error details out of 500 alert payloads', async () => {
    const { __discordTestUtils__ } = await import('../supabase/functions/_backend/utils/discord.ts')
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

  it('summarizes disabled Discord payload logs without serializing payload content', async () => {
    const { sendDiscordAlert } = await import('../supabase/functions/_backend/utils/discord.ts')

    await sendDiscordAlert(createContext(), {
      content: 'contains token raw-token-value',
      embeds: [
        {
          description: 'contains password raw-password-value',
          title: 'sensitive payload',
        },
      ],
    } as any)

    const serialized = JSON.stringify(cloudlogMock.mock.calls)

    expect(cloudlogMock).toHaveBeenCalledWith(expect.objectContaining({
      payload: {
        embedCount: 1,
        hasContent: true,
        payloadType: 'object',
      },
    }))
    expect(serialized).not.toContain('raw-token-value')
    expect(serialized).not.toContain('raw-password-value')
  })

  it('summarizes Discord fetch errors without retaining webhook tokens', async () => {
    const { sendDiscordAlert } = await import('../supabase/functions/_backend/utils/discord.ts')
    envState.discordAlert = 'https://discord.com/api/webhooks/app-id/discord-webhook-secret-token'
    fetchMock.mockRejectedValue(new Error(`connect failed: ${envState.discordAlert}`))
    vi.stubGlobal('fetch', fetchMock)

    await sendDiscordAlert(createContext(), {
      content: 'hello',
    } as any)

    const serialized = JSON.stringify(cloudlogErrMock.mock.calls)

    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      error: {
        errorName: 'Error',
        hasMessage: true,
        messageLength: envState.discordAlert.length + 'connect failed: '.length,
      },
      message: 'Discord webhook error',
    }))
    expect(serialized).not.toContain('discord-webhook-secret-token')
    expect(serialized).not.toContain(envState.discordAlert)
  })
})
