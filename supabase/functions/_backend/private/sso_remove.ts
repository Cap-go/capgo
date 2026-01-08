/**
 * SSO Configuration Endpoint - DELETE /private/sso/remove
 *
 * Removes a SAML SSO connection from an organization.
 * Requires super_admin permissions.
 *
 * @endpoint DELETE /private/sso/remove
 * @authentication JWT (requires super_admin permissions)
 *
 * Request Body:
 * {
 *   orgId: string (UUID)
 *   providerId: string (UUID - sso_provider_id to remove)
 * }
 *
 * Response:
 * {
 *   status: 'ok'
 *   message: 'SSO connection removed successfully'
 * }
 */

import { z } from 'zod'
import { createHono, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { hasOrgRight } from '../utils/supabase.ts'
import { removeSAML } from './sso_management.ts'

const removeSchema = z.object({
  orgId: z.string().uuid(),
  providerId: z.string().uuid(),
})

export const app = createHono()

app.use('/', useCors)

app.delete('/', middlewareV2(['all']), async (c) => {
  const auth = c.get('auth')
  const requestId = c.get('requestId')

  if (!auth?.userId) {
    return simpleError('unauthorized', 'Authentication required')
  }

  cloudlog({
    requestId,
    message: '[SSO Remove] Processing SSO removal request',
    userId: auth.userId,
  })

  try {
    const bodyRaw = await parseBody<any>(c)

    // Validate request body
    const parsedBody = removeSchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      cloudlog({
        requestId,
        message: '[SSO Remove] Invalid request body',
        errors: parsedBody.error.issues,
      })
      return simpleError('invalid_json_body', 'Invalid request body', {
        errors: parsedBody.error.issues,
      })
    }

    const { orgId, providerId } = parsedBody.data

    // Check super_admin permission BEFORE executing SSO removal
    const hasPermission = await hasOrgRight(c, orgId, auth.userId, 'super_admin')
    if (!hasPermission) {
      cloudlog({
        requestId,
        message: '[SSO Remove] Permission denied - user is not super_admin',
        userId: auth.userId,
        orgId,
      })
      return quickError(403, 'insufficient_permissions', 'Only super administrators can remove SSO configuration')
    }

    // Execute SSO removal
    await removeSAML(c, orgId, providerId)

    cloudlog({
      requestId,
      message: '[SSO Remove] SSO removal successful',
      providerId,
      orgId,
    })

    return c.json({
      status: 'ok',
      message: 'SSO connection removed successfully',
    })
  }
  catch (error: any) {
    cloudlog({
      requestId,
      message: '[SSO Remove] SSO removal failed',
      error: error.message,
    })

    throw error
  }
})
