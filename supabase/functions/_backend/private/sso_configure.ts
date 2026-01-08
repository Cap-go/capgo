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

import { createHono, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { hasOrgRight } from '../utils/supabase.ts'
import { version } from '../utils/version.ts'
import { configureSAML, ssoConfigSchema } from './sso_management.ts'

const functionName = 'sso_configure'
export const app = createHono(functionName, version)

app.use('/', useCors)

app.post('/', middlewareV2(['all']), async (c) => {
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
      const firstError = parsedBody.error.issues[0]
      const errorMessage = firstError ? firstError.message : 'Invalid request body'
      cloudlog({
        requestId,
        message: '[SSO Configure] Invalid request body',
        errors: parsedBody.error.issues,
      })
      return simpleError('invalid_json_body', errorMessage, {
        errors: parsedBody.error.issues,
      })
    }

    const config = parsedBody.data

    // Check super_admin permission BEFORE executing SSO configuration
    const hasPermission = await hasOrgRight(c, config.orgId, auth.userId, 'super_admin')
    if (!hasPermission) {
      cloudlog({
        requestId,
        message: '[SSO Configure] Permission denied - user is not super_admin',
        userId: auth.userId,
        orgId: config.orgId,
      })
      return quickError(403, 'insufficient_permissions', 'Only super administrators can configure SSO')
    }

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
