/**
 * SSO Status Endpoint - GET /private/sso/status
 *
 * Retrieves SSO configuration status for an organization.
 * Requires read permissions or higher.
 *
 * @endpoint GET /private/sso/status
 * @authentication JWT (requires read permissions)
 *
 * Query Parameters:
 * - orgId: string (UUID)
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

import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono'
import { z } from 'zod'
import { parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { getSSOStatus } from './sso_management.ts'

const bodySchema = z.object({
  orgId: z.string().uuid(),
})

export const app = new Hono<MiddlewareKeyVariables>()

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
