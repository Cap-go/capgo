import { describe, expect, it } from 'vitest'

describe('[GET] /translations/:locale', () => {
  it.concurrent('returns the requested locale payload with cache headers', async () => {
    const { app: translations } = await import('../supabase/functions/_backend/public/translations/index.ts')
    const { createAllCatch, createHono } = await import('../supabase/functions/_backend/utils/hono.ts')
    const { version } = await import('../supabase/functions/_backend/utils/version.ts')

    const app = createHono('translations', version)
    app.route('/', translations)
    createAllCatch(app, 'translations')

    const response = await app.fetch(new Request('http://localhost/fr'))

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=86400')
    expect(response.headers.get('content-language')).toBe('fr')

    const data = await response.json() as Record<string, string>
    expect(data['accept-invitation']).toBe('Accepter l\'invitation')
  })

  it.concurrent('rejects unsupported locales', async () => {
    const { app: translations } = await import('../supabase/functions/_backend/public/translations/index.ts')
    const { createAllCatch, createHono } = await import('../supabase/functions/_backend/utils/hono.ts')
    const { version } = await import('../supabase/functions/_backend/utils/version.ts')

    const app = createHono('translations', version)
    app.route('/', translations)
    createAllCatch(app, 'translations')

    const response = await app.fetch(new Request('http://localhost/klingon'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: 'unsupported_locale',
      message: 'Unsupported locale',
    })
  })
})
