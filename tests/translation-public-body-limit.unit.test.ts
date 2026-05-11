import { describe, expect, it } from 'vitest'
import { app } from '../supabase/functions/_backend/public/translation.ts'

describe('public translation body limit', () => {
  it('rejects oversized content-length before reading the body', async () => {
    const response = await app.request(new Request('http://local/messages', {
      body: JSON.stringify({ targetLanguage: 'fr' }),
      duplex: 'half',
      headers: {
        'Content-Length': '2048',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    } as RequestInit))

    expect(response.status).toBe(413)
    expect(await response.text()).toContain('Request body is too large')
  })

  it('rejects streamed bodies that exceed the translation request limit', async () => {
    const response = await app.request('http://local/messages', {
      body: JSON.stringify({
        targetLanguage: 'fr',
        padding: 'x'.repeat(2048),
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    expect(response.status).toBe(413)
    expect(await response.text()).toContain('Request body is too large')
  })
})
