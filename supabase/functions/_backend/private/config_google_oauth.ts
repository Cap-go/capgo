import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { useCors } from '../utils/hono.ts'
import { getEnv } from '../utils/utils.ts'

const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/androidpublisher']

function parseScopes(raw: string): string[] {
  if (!raw)
    return DEFAULT_SCOPES
  const parsed = raw.split(',').map(s => s.trim()).filter(s => s.length > 0)
  return parsed.length > 0 ? parsed : DEFAULT_SCOPES
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', (c) => {
  const clientId = getEnv(c, 'GOOGLE_OAUTH_CLIENT_ID').trim()
  const clientSecret = getEnv(c, 'GOOGLE_OAUTH_CLIENT_SECRET').trim()

  if (!clientId || !clientSecret)
    return c.json({ enabled: false })

  return c.json({
    enabled: true,
    clientId,
    clientSecret,
    scopes: parseScopes(getEnv(c, 'GOOGLE_OAUTH_SCOPES')),
  })
})
