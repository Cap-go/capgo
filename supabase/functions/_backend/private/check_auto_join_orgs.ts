/**
 * Auto-Join Organizations on Login - Check Endpoint
 * 
 * This endpoint is called during user login to check if the user should be automatically
 * added to any organizations based on their email domain. This handles the case where:
 * 1. A user created their account before a domain was configured for auto-join
 * 2. An organization enabled auto-join after the user signed up
 * 3. Multiple organizations added the same domain after the user joined
 * 
 * @endpoint POST /private/check_auto_join_orgs
 * @authentication JWT (user must be logged in)
 * @param {uuid} user_id - User UUID to check for auto-join eligibility
 * @returns {object} Result containing number of organizations joined
 *   - status: 'ok' if successful
 *   - orgs_joined: Number of organizations the user was added to
 * 
 * Example Flow:
 * 1. User logs in with email: john@company.com
 * 2. System checks if any orgs have 'company.com' in allowed_email_domains
 * 3. If found and sso_enabled=true, adds user to those orgs with 'read' permission
 * 4. Returns count of organizations joined
 * 
 * Note: This does NOT block login if it fails - errors are logged but ignored
 */

import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { supabaseClient as useSupabaseClient } from '../utils/supabase.ts'
import { cloudlog } from '../utils/logging.ts'

/** Request body validation schema */
const bodySchema = z.object({
  user_id: z.uuid(),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

/**
 * Check and execute auto-join for existing users
 * 
 * Called from src/modules/auth.ts during login flow
 * Uses the same database function as signup trigger for consistency
 */
app.post('/', middlewareAuth, async (c) => {
  const body = await parseBody<any>(c)
  const parsedBodyResult = bodySchema.safeParse(body)

  if (!parsedBodyResult.success) {
    return simpleError('invalid_body', 'Invalid body', { error: parsedBodyResult.error })
  }

  const { user_id } = parsedBodyResult.data
  const requestId = c.get('requestId')
  const authToken = c.req.header('authorization')

  if (!authToken)
    return simpleError('not_authorize', 'Not authorize')

  const supabaseClient = useSupabaseClient(c, authToken)

  // Get user's email
  const { data: user, error: userError } = await supabaseClient
    .from('users')
    .select('email')
    .eq('id', user_id)
    .single()

  if (userError || !user) {
    cloudlog({ requestId, message: 'User not found', error: userError })
    return c.json({ error: 'user_not_found' }, 404)
  }

  // Call the auto-join function
  const { data, error } = await (supabaseClient as any)
    .rpc('auto_join_user_to_orgs_by_email', {
      p_user_id: user_id,
      p_email: user.email,
    })

  if (error) {
    cloudlog({ requestId, message: 'Error auto-joining user to orgs', error })
    return c.json({ error: 'auto_join_failed' }, 500)
  }

  cloudlog({ requestId, message: 'Auto-join check completed', user_id, orgs_joined: data })
  return c.json({ status: 'ok', orgs_joined: data })
})
