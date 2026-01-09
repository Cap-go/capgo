import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../_backend/utils/hono.ts'
import { createHono } from '../_backend/utils/hono.ts'
import { cloudlog } from '../_backend/utils/logging.ts'
import { getEnv } from '../_backend/utils/utils.ts'
import { version } from '../_backend/utils/version.ts'

/**
 * Mock SSO Callback Endpoint for Local Development
 *
 * This endpoint simulates SAML SSO authentication for local testing.
 * It validates the email parameter and returns a mock authentication response.
 *
 * Query Parameters:
 * - email: User email address (required, validated)
 * - RelayState: Redirect path after authentication (optional)
 */

const functionName = 'mock-sso-callback'
const app = createHono(functionName, version, Deno.env.get('SENTRY_DSN_SUPABASE'))

// Email validation regex - simplified to avoid super-linear backtracking
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

// Allowed production hosts for RelayState validation
const ALLOWED_HOSTS = ['capgo.app', 'usecapgo.com', 'web.capgo.app']

app.get('/', async (c: Context<MiddlewareKeyVariables>) => {
  // Environment guard: block in production
  const nodeEnv = getEnv(c, 'NODE_ENV') || Deno.env.get('NODE_ENV')
  const mockSSOEnabled = getEnv(c, 'MOCK_SSO_ENABLED') || Deno.env.get('MOCK_SSO_ENABLED')

  if (nodeEnv === 'production' || (nodeEnv !== 'development' && nodeEnv !== 'local' && !mockSSOEnabled)) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Mock SSO endpoint blocked in production',
      nodeEnv,
    })
    return c.json({ error: 'Not found' }, 404)
  }
  try {
    const email = c.req.query('email')
    const relayState = c.req.query('RelayState') || '/dashboard'

    // Validate email parameter
    if (!email) {
      return c.json({ error: 'Missing email parameter' }, 400)
    }

    // Sanitize and validate email format
    const sanitizedEmail = email.trim().toLowerCase()
    if (!EMAIL_REGEX.test(sanitizedEmail)) {
      return c.json({ error: 'Invalid email format' }, 400)
    }

    // Prevent email injection attacks
    if (sanitizedEmail.includes('<') || sanitizedEmail.includes('>') || sanitizedEmail.includes(';')) {
      return c.json({ error: 'Invalid characters in email' }, 400)
    }

    // Validate and normalize RelayState to prevent open redirect
    let safeRelayState = '/dashboard'
    if (relayState && typeof relayState === 'string') {
      // Check if it's a relative path (safe)
      if (relayState.startsWith('/') && !relayState.includes('//')) {
        safeRelayState = relayState
      }
      // Check if it's a full URL from allowed hosts
      else if (relayState.startsWith('http://') || relayState.startsWith('https://')) {
        try {
          const url = new URL(relayState)
          if (ALLOWED_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
            safeRelayState = relayState
          }
        }
        catch {
          // Invalid URL, use default
        }
      }
    }

    // Construct safe redirect URL pointing to the validated RelayState
    const redirectUrl = `${safeRelayState}${safeRelayState.includes('?') ? '&' : '?'}success=true&email=${encodeURIComponent(sanitizedEmail)}`

    return c.redirect(redirectUrl, 302)
  }
  catch (error: any) {
    return c.json({
      error: 'Mock SSO callback failed',
      message: error?.message || 'Unknown error',
    }, 500)
  }
})

export default app
