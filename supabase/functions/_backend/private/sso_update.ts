/**
 * SSO Configuration Endpoint - PUT /private/sso/update
 *
 * Updates an existing SAML SSO connection.
 * Requires super_admin permissions.
 *
 * @endpoint PUT /private/sso/update
 * @authentication JWT (requires super_admin permissions)
 *
 * Request Body:
 * {
 *   orgId: string (UUID)
 *   providerId: string (UUID - sso_provider_id)
 *   providerName?: string
 *   metadataUrl?: string (HTTPS URL)
 *   metadataXml?: string (SAML metadata XML)
 *   domains?: string[] (email domains)
 *   enabled?: boolean
 *   attributeMapping?: Record<string, any>
 * }
 *
 * Response:
 * {
 *   status: 'ok'
 *   message: 'SSO connection updated successfully'
 * }
 */

import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono'
import { parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { ssoUpdateSchema, updateSAML } from './sso_management.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.put('/', middlewareV2(['super_admin']), async (c) => {
  const auth = c.get('auth')
  const requestId = c.get('requestId')

  if (!auth?.userId) {
    return simpleError('unauthorized', 'Authentication required')
  }

  cloudlog({
    requestId,
    message: '[SSO Update] Processing SSO update request',
    userId: auth.userId,
  })

  try {
    const bodyRaw = await parseBody<any>(c)

    // Validate request body
    const parsedBody = ssoUpdateSchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      cloudlog({
        requestId,
        message: '[SSO Update] Invalid request body',
        errors: parsedBody.error.issues,
      })
      return simpleError('invalid_json_body', 'Invalid request body', {
        errors: parsedBody.error.issues,
      })
    }

    const update = parsedBody.data

    // Execute SSO update
    await updateSAML(c, update)

    cloudlog({
      requestId,
      message: '[SSO Update] SSO update successful',
      providerId: update.providerId,
    })

    // Return updated configuration
    const { getSSOStatus } = await import('./sso_management.ts')
    const updatedConfig = await getSSOStatus(c, update.orgId)

    // Return first connection (should only be one per org for now)
    const config = updatedConfig[0] || {}

    return c.json(config)
  }
  catch (error: any) {
    cloudlog({
      requestId,
      message: '[SSO Update] SSO update failed',
      error: error.message,
    })

    throw error
  }
})
