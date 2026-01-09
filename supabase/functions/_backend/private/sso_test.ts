/**
 * Test SSO connection endpoint
 * Validates SAML metadata and configuration before enabling SSO
 *
 * Why we need this custom endpoint:
 * Supabase's built-in SSO test endpoint (/auth/v1/sso/test) only works AFTER SSO is fully enabled.
 * However, our UX requires users to test the configuration BEFORE enabling it (step 4 in our wizard).
 *
 * This endpoint performs comprehensive validation:
 * 1. SSO configuration exists in our database
 * 2. Provider exists in Supabase Auth (GoTrue)
 * 3. Required fields are present (Entity ID, Metadata URL/XML)
 * 4. Fetches and parses SAML metadata XML
 * 5. Validates certificate exists and format
 * 6. Checks entity ID matches between config and metadata
 * 7. Verifies required SAML elements are present
 * 8. Validates domain mappings exist
 *
 * This catches most configuration errors before going live, without requiring actual SAML auth flow.
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createHono, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { org_saml_connections, saml_domain_mappings } from '../utils/postgres_schema.ts'
import { getEnv } from '../utils/utils.ts'
import { version } from '../utils/version.ts'

const testSSOSchema = z.object({
  orgId: z.string().uuid(),
})

/**
 * Parse and validate SAML metadata XML
 */
async function validateSAMLMetadata(
  metadataXml: string,
  expectedEntityId: string,
): Promise<{ valid: boolean, errors: string[], warnings: string[] }> {
  const errors: string[] = []
  const warnings: string[] = []

  try {
    // Check if XML is well-formed
    if (!metadataXml || metadataXml.trim().length === 0) {
      errors.push('Metadata XML is empty')
      return { valid: false, errors, warnings }
    }

    // Basic XML structure validation
    if (!metadataXml.includes('EntityDescriptor')) {
      errors.push('Missing EntityDescriptor element in metadata')
    }

    // Check for entity ID in metadata
    const entityIdMatch = metadataXml.match(/entityID=["']([^"']+)["']/)
    if (!entityIdMatch) {
      errors.push('Entity ID not found in metadata')
    }
    else if (entityIdMatch[1] !== expectedEntityId) {
      errors.push(`Entity ID mismatch: config has "${expectedEntityId}" but metadata has "${entityIdMatch[1]}"`)
    }

    // Check for SSO descriptor
    if (!metadataXml.includes('IDPSSODescriptor')) {
      errors.push('Missing IDPSSODescriptor - this doesn\'t appear to be IdP metadata')
    }

    // Check for certificate
    if (!metadataXml.includes('X509Certificate')) {
      errors.push('No X509 certificate found in metadata')
    }
    else {
      // Extract certificate and do basic validation
      const certMatch = metadataXml.match(/<X509Certificate>([^<]+)<\/X509Certificate>/)
      if (certMatch) {
        const cert = certMatch[1].trim()
        if (cert.length < 100) {
          warnings.push('Certificate appears too short, may be invalid')
        }
        // Check for PEM header/footer (shouldn't be in XML)
        if (cert.includes('BEGIN CERTIFICATE')) {
          warnings.push('Certificate contains PEM headers - should be raw base64')
        }
      }
    }

    // Check for SingleSignOnService
    if (!metadataXml.includes('SingleSignOnService')) {
      errors.push('No SingleSignOnService endpoint found in metadata')
    }

    // Check for supported bindings
    const hasRedirect = metadataXml.includes('urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect')
    const hasPost = metadataXml.includes('urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST')
    if (!hasRedirect && !hasPost) {
      errors.push('No HTTP-Redirect or HTTP-POST binding found')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }
  catch (error: any) {
    errors.push(`Failed to parse metadata: ${error.message}`)
    return { valid: false, errors, warnings }
  }
}

/**
 * Verify SSO provider exists in Supabase Auth (GoTrue)
 * This is critical - without this, signInWithSSO will fail
 * In local development, skip this check as we use mock SSO
 */
async function verifyProviderInSupabaseAuth(
  c: Context,
  providerId: string,
): Promise<{ exists: boolean, provider?: any, error?: string }> {
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  const serviceRoleKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')

  // For local development, skip Auth verification since we use mock SSO
  const isLocal = supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('kong')

  if (isLocal) {
    cloudlog({
      requestId: c.get('requestId'),
      message: '[SSO Test] Local development detected - skipping Auth verification',
      providerId,
    })
    return {
      exists: true,
      provider: {
        id: providerId,
        type: 'saml',
        mock: true,
      },
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const response = await fetch(`${supabaseUrl}/auth/v1/admin/sso/providers/${providerId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.status === 404) {
      return { exists: false, error: 'Provider not registered in Supabase Auth - SSO login will fail' }
    }

    if (!response.ok) {
      const errorText = await response.text()
      return { exists: false, error: `Failed to verify provider: ${errorText}` }
    }

    const provider = await response.json()
    return { exists: true, provider }
  }
  catch (error: any) {
    return { exists: false, error: `Failed to connect to Supabase Auth: ${error.message}` }
  }
}

const functionName = 'sso_test'
export const app = createHono(functionName, version)

app.use('/', useCors)

/**
 * POST /private/sso_test
 * Test SSO configuration validity
 */
app.post('/', middlewareV2(['read', 'write', 'all']), async (c) => {
  const auth = c.get('auth')
  const requestId = c.get('requestId')

  if (!auth?.userId) {
    return simpleError('unauthorized', 'Authentication required')
  }

  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    const body = await parseBody<any>(c)

    // Validate body
    const parsedBody = testSSOSchema.safeParse(body)
    if (!parsedBody.success) {
      cloudlog({
        requestId,
        message: '[SSO Test] Invalid request body',
        errors: parsedBody.error.issues,
      })
      return simpleError('invalid_json_body', 'orgId is required and must be a valid UUID', {
        errors: parsedBody.error.issues,
      })
    }

    const { orgId } = parsedBody.data

    cloudlog({
      requestId,
      message: '[SSO Test] Testing SSO configuration',
      orgId,
    })

    // Get SSO configuration
    const connections = await drizzleClient
      .select({
        id: org_saml_connections.id,
        sso_provider_id: org_saml_connections.sso_provider_id,
        provider_name: org_saml_connections.provider_name,
        entity_id: org_saml_connections.entity_id,
        metadata_url: org_saml_connections.metadata_url,
        metadata_xml: org_saml_connections.metadata_xml,
        enabled: org_saml_connections.enabled,
      })
      .from(org_saml_connections)
      .where(eq(org_saml_connections.org_id, orgId))
      .limit(1)

    if (!connections.length) {
      cloudlog({
        requestId,
        message: '[SSO Test] SSO not configured',
        orgId,
      })

      return c.json({
        error: 'sso_not_configured',
        message: 'SSO is not configured for this organization',
      }, 404)
    }

    const config = connections[0]

    // Validate configuration
    const validationErrors: string[] = []
    const validationWarnings: string[] = []

    if (!config.entity_id) {
      validationErrors.push('Entity ID is missing')
    }

    if (!config.metadata_url && !config.metadata_xml) {
      validationErrors.push('Metadata URL or XML is required')
    }

    // ==========================================
    // CRITICAL: Verify provider exists in Supabase Auth
    // Without this, signInWithSSO will fail with "provider not found"
    // ==========================================
    cloudlog({
      requestId,
      message: '[SSO Test] Verifying provider exists in Supabase Auth',
      providerId: config.sso_provider_id,
    })

    const authVerification = await verifyProviderInSupabaseAuth(c, config.sso_provider_id)
    if (!authVerification.exists) {
      validationErrors.push(authVerification.error || 'Provider not found in Supabase Auth')
      cloudlog({
        requestId,
        message: '[SSO Test] Provider NOT found in Supabase Auth',
        providerId: config.sso_provider_id,
        error: authVerification.error,
      })
    }
    else {
      cloudlog({
        requestId,
        message: '[SSO Test] Provider verified in Supabase Auth',
        providerId: config.sso_provider_id,
        entityId: authVerification.provider?.saml?.entity_id,
      })

      // Check if domains are configured in Supabase Auth
      if (!authVerification.provider?.domains || authVerification.provider.domains.length === 0) {
        validationWarnings.push('No domains configured in Supabase Auth - users will need to use provider ID to sign in')
      }
    }

    // ==========================================
    // Check domain mappings exist in our database
    // ==========================================
    const domainMappings = await drizzleClient
      .select({ domain: saml_domain_mappings.domain })
      .from(saml_domain_mappings)
      .where(eq(saml_domain_mappings.sso_connection_id, config.id))

    if (domainMappings.length === 0) {
      validationWarnings.push('No email domains configured - users cannot use email-based SSO login')
    }
    else {
      cloudlog({
        requestId,
        message: '[SSO Test] Domain mappings found',
        domains: domainMappings.map(d => d.domain),
      })
    }

    if (validationErrors.length > 0) {
      cloudlog({
        requestId,
        message: '[SSO Test] Invalid configuration',
        errors: validationErrors,
      })

      return c.json({
        error: 'invalid_configuration',
        message: 'SSO configuration is invalid',
        errors: validationErrors,
        warnings: validationWarnings,
      }, 400)
    }

    // Get metadata XML (fetch from URL if needed)
    let metadataXml = config.metadata_xml

    if (!metadataXml && config.metadata_url) {
      cloudlog({
        requestId,
        message: '[SSO Test] Fetching metadata from URL',
        url: config.metadata_url,
      })

      try {
        const metadataResponse = await fetch(config.metadata_url, {
          headers: {
            Accept: 'application/xml, text/xml',
          },
        })

        if (!metadataResponse.ok) {
          validationErrors.push(`Failed to fetch metadata: HTTP ${metadataResponse.status}`)
        }
        else {
          metadataXml = await metadataResponse.text()

          cloudlog({
            requestId,
            message: '[SSO Test] Metadata fetched successfully',
            size: metadataXml.length,
          })
        }
      }
      catch (error: any) {
        validationErrors.push(`Failed to fetch metadata from URL: ${error.message}`)
        cloudlog({
          requestId,
          message: '[SSO Test] Failed to fetch metadata',
          error: error.message,
        })
      }
    }

    // If entity_id is placeholder and we have metadata, extract and update it
    if (metadataXml && config.entity_id === 'https://example.com/saml/entity') {
      const entityIdMatch = metadataXml.match(/entityID=["']([^"']+)["']/)
      if (entityIdMatch && entityIdMatch[1]) {
        const actualEntityId = entityIdMatch[1]

        cloudlog({
          requestId,
          message: '[SSO Test] Updating placeholder entity_id with actual value from metadata',
          old: config.entity_id,
          new: actualEntityId,
        })

        // Update the database
        await drizzleClient
          .update(org_saml_connections)
          .set({ entity_id: actualEntityId })
          .where(eq(org_saml_connections.id, config.id))

        // Update local config object for validation
        config.entity_id = actualEntityId
      }
    }

    // Ensure SSO is enabled (default behavior)
    if (!config.enabled) {
      cloudlog({
        requestId,
        message: '[SSO Test] Enabling SSO (should be enabled by default)',
      })

      await drizzleClient
        .update(org_saml_connections)
        .set({ enabled: true })
        .where(eq(org_saml_connections.id, config.id))

      config.enabled = true
    }

    // Validate the SAML metadata if we have it
    const metadataValidation = metadataXml && config.entity_id
      ? await validateSAMLMetadata(metadataXml, config.entity_id)
      : { valid: false, errors: ['No metadata available'], warnings: [] }

    // Combine all validation errors
    const allErrors = [...validationErrors, ...metadataValidation.errors]

    if (allErrors.length > 0) {
      cloudlog({
        requestId,
        message: '[SSO Test] Validation failed',
        errors: allErrors,
        warnings: metadataValidation.warnings,
      })

      return c.json({
        error: 'validation_failed',
        message: 'SSO configuration validation failed',
        errors: allErrors,
        warnings: metadataValidation.warnings,
      }, 400)
    }

    cloudlog({
      requestId,
      message: '[SSO Test] Configuration validated successfully',
      provider: config.provider_name,
      warnings: metadataValidation.warnings,
    })

    // Mark as verified when test passes
    await drizzleClient
      .update(org_saml_connections)
      .set({ verified: true })
      .where(eq(org_saml_connections.id, config.id))

    cloudlog({
      requestId,
      message: '[SSO Test] Marked connection as verified',
    })

    // Combine all warnings
    const allWarnings = [...validationWarnings, ...metadataValidation.warnings]

    // Return success - configuration is valid
    return c.json({
      success: true,
      message: 'SSO configuration is valid and ready to use',
      provider: config.provider_name,
      sso_provider_id: config.sso_provider_id,
      entity_id: config.entity_id,
      domains: domainMappings.map(d => d.domain),
      has_metadata_url: !!config.metadata_url,
      has_metadata_xml: !!config.metadata_xml,
      supabase_auth_verified: authVerification.exists,
      warnings: allWarnings,
      checks: {
        config_exists: true,
        supabase_auth_provider: authVerification.exists,
        metadata_valid: metadataValidation.valid,
        domains_configured: domainMappings.length > 0,
      },
    })
  }
  catch (error: any) {
    cloudlog({
      requestId,
      message: '[SSO Test] Test failed',
      error: error.message,
    })

    return c.json({
      error: 'test_failed',
      message: error.message || 'Failed to test SSO configuration',
    }, 500)
  }
  finally {
    await closeClient(c, pgClient)
  }
})
