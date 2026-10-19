import type { Context } from 'hono'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildOpenAIRegistrationEvent, normalizeOpenAIName, trackOpenAIRegistration } from '../supabase/functions/_backend/utils/openai_ads.ts'

const envValues: Record<string, string> = {}

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: vi.fn(),
  cloudlogErr: vi.fn(),
  serializeError: (error: unknown) => error,
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: (_context: unknown, key: string) => envValues[key] ?? '',
}))

function createContext() {
  return { get: vi.fn(() => 'request-id') } as unknown as Context
}

const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

const now = Date.parse('2026-10-19T12:00:00.000Z')
const record = {
  id: ' 6aa76066-55ef-4238-ade6-0b32334a4097 ',
  email: '  John.Doe@Example.com ',
  first_name: 'Mary Jane',
  last_name: 'O\'Connor',
  country: 'fr',
  created_at: '2026-10-19T11:59:00.000Z',
}

describe('openai ads conversions api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const key of Object.keys(envValues))
      delete envValues[key]
  })

  it('normalizes names like the spec', () => {
    expect(normalizeOpenAIName('Mary Jane')).toBe('maryjane')
    expect(normalizeOpenAIName('O\'Connor')).toBe('oconnor')
    expect(normalizeOpenAIName('José')).toBe('josé')
  })

  it('builds a registration event matching the pixel event id and hashed user data', async () => {
    const userIdHash = sha('6aa76066-55ef-4238-ade6-0b32334a4097')
    expect(await buildOpenAIRegistrationEvent(record, now)).toEqual({
      id: `registration_${userIdHash}`,
      type: 'registration_completed',
      timestamp_ms: Date.parse(record.created_at),
      source_url: 'https://capgo.app/register/',
      action_source: 'web',
      user: {
        external_ids_sha256: [userIdHash],
        emails_sha256: [sha('john.doe@example.com')],
        first_names_sha256: [sha('maryjane')],
        last_names_sha256: [sha('oconnor')],
        countries: ['FR'],
      },
      data: { type: 'customer_action' },
    })
  })

  it('does nothing without OPENAI_ADS_API_KEY', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await trackOpenAIRegistration(createContext(), record)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts to the Conversions API with bearer auth and pixel id', async () => {
    envValues.OPENAI_ADS_API_KEY = 'test-key'
    vi.useFakeTimers({ now, toFake: ['Date'] })
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      expect(await trackOpenAIRegistration(createContext(), record)).toBe(true)
    }
    finally {
      vi.useRealTimers()
    }
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://bzr.openai.com/v1/events?pid=5Fiq7Kwp18THe1MThKS7GL')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
    const body = JSON.parse(init.body as string)
    expect(body.events).toHaveLength(1)
    expect(body.events[0].type).toBe('registration_completed')
  })

  it('never throws on network or API errors', async () => {
    envValues.OPENAI_ADS_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))
    expect(await trackOpenAIRegistration(createContext(), { ...record, created_at: null })).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })))
    expect(await trackOpenAIRegistration(createContext(), { ...record, created_at: null })).toBe(false)
  })
})
