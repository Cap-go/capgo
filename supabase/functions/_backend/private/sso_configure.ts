/**
 * SSO Configuration Endpoint - POST /private/sso/configure
 *
 * Adds a new SAML SSO connection for an organization.
 * Requires super_admin permissions.
 *
 * @endpoint POST /private/sso/configure
 * @authentication JWT (requires super_admin permissions)
 *
 * Request Body:
 * {
 *   orgId: string (UUID)
 *   providerName: string
 *   metadataUrl?: string (HTTPS URL)
 *   metadataXml?: string (SAML metadata XML)
 *   domains: string[] (email domains)
 *   attributeMapping?: Record<string, any>
 * }
 *
 * Response:
 * {
 *   status: 'ok'
 *   sso_provider_id: string (UUID from Supabase)
 *   org_id: string
 *   entity_id: string (IdP entity ID)
 * }
 */

import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono'
import { parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { configureSAML, ssoConfigSchema } from './sso_management.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareV2(['super_admin']), async (c) => {
  const auth = c.get('auth')
  const requestId = c.get('requestId')

  if (!auth?.userId) {
    return simpleError('unauthorized', 'Authentication required')
  }

  cloudlog({
    requestId,
    message: '[SSO Configure] Processing SSO configuration request',
    userId: auth.userId,
  })

  try {
    const bodyRaw = await parseBody<any>(c)

    // Validate request body
    const parsedBody = ssoConfigSchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      cloudlog({
        requestId,
        message: '[SSO Configure] Invalid request body',
        errors: parsedBody.error.issues,
      })
      return simpleError('invalid_json_body', 'Invalid request body', {
        errors: parsedBody.error.issues,
      })
    }

    const config = parsedBody.data

    // Execute SSO configuration
    const result = await configureSAML(c, config)

    cloudlog({
      requestId,
      message: '[SSO Configure] SSO configuration successful',
      sso_provider_id: result.sso_provider_id,
      org_id: result.org_id,
    })

    return c.json({
      status: 'ok',
      ...result,
    })
  }
  catch (error: any) {
    cloudlog({
      requestId,
      message: '[SSO Configure] SSO configuration failed',
      error: error.message,
    })

    // Re-throw to let error handler deal with it
    throw error
  }
})
