import type { Context } from 'hono'
import { createHono } from '../_backend/utils/hono.ts'

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
const app = createHono(functionName, import.meta.url)

// Email validation regex - simplified to avoid super-linear backtracking
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

app.get('/', async (c: Context) => {
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

    // In local development, redirect back with mock success
    // In a real scenario, this would integrate with Supabase Auth
    const redirectUrl = `${c.req.url.split('?')[0]}?success=true&email=${encodeURIComponent(sanitizedEmail)}&redirect=${encodeURIComponent(relayState)}`

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
