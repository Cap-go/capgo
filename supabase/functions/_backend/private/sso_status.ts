/**
 * SSO Status Endpoint - POST /private/sso/status
 *
 * Retrieves SSO configuration status for an organization.
 * Requires read permissions or higher for the organization.
 *
 * @endpoint POST /private/sso/status
 * @authentication JWT (requires read permissions or higher)
 *
 * Request Body:
 * {
 *   orgId: string (UUID)
 * }
 *
 * Response:
 * {
 *   status: 'ok'
 *   connections: Array<{
 *     sso_provider_id: string
 *     provider_name: string
 *     entity_id: string
 *     enabled: boolean
 *     verified: boolean
 *     domains: string[]
 *     metadata_url: string | null
 *     created_at: string
 *   }>
 * }
 */

import { z } from 'zod'
import { createHono, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { hasOrgRight } from '../utils/supabase.ts'
import { version } from '../utils/version.ts'
import { getSSOStatus } from './sso_management.ts'

const bodySchema = z.object({
  orgId: z.string().uuid(),
})

const functionName = 'sso_status'
export const app = createHono(functionName, version)

app.use('/', useCors)

app.post('/', middlewareV2(['read', 'write', 'all']), async (c) => {
  const auth = c.get('auth')
  const requestId = c.get('requestId')

  if (!auth?.userId) {
    return simpleError('unauthorized', 'Authentication required')
  }

  try {
    const body = await parseBody<any>(c)

    // Validate body
    const parsedBody = bodySchema.safeParse(body)
    if (!parsedBody.success) {
      cloudlog({
        requestId,
        message: '[SSO Status] Invalid request body',
        errors: parsedBody.error.issues,
      })
      return simpleError('invalid_json_body', 'orgId is required and must be a valid UUID', {
        errors: parsedBody.error.issues,
      })
    }

    cloudlog({
      requestId,
      message: '[SSO Status] Retrieving SSO status',
      orgId: parsedBody.data.orgId,
    })

    // Check organization membership before allowing SSO status query
    const hasPermission = await hasOrgRight(c, parsedBody.data.orgId, auth.userId, 'read')
    if (!hasPermission) {
      cloudlog({
        requestId,
        message: '[SSO Status] Access denied - user not member of organization',
        userId: auth.userId,
        orgId: parsedBody.data.orgId,
      })
      return simpleError('unauthorized', 'Organization access required')
    }

    // Get SSO status
    const connections = await getSSOStatus(c, parsedBody.data.orgId)

    cloudlog({
      requestId,
      message: '[SSO Status] SSO status retrieved successfully',
      connectionCount: connections.length,
    })

    // Return first connection only (one SSO config per org)
    const config = connections[0] || null

    return c.json(config)
  }
  catch (error: any) {
    cloudlog({
      requestId,
      message: '[SSO Status] Failed to retrieve SSO status',
      error: error.message,
    })

    throw error
  }
})
