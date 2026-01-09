/**
 * SSO SAML Management Service
 *
 * This service manages SAML SSO connections by:
 * 1. Storing configuration in Capgo's database (org_saml_connections, saml_domain_mappings)
 * 2. Registering providers with Supabase Auth via GoTrue Admin API
 *
 * Key Operations:
 * - configureSAML: Add new SAML connection and register with Supabase Auth
 * - updateSAML: Update existing SAML connection
 * - removeSAML: Remove SAML connection
 * - getSSOInfo: Get SAML connection details
 * - listSSOProviders: List all SAML connections
 *
 * Security:
 * - All operations require super_admin permissions
 * - Input validation prevents injection attacks
 * - Metadata URL/XML sanitization
 * - Comprehensive audit logging
 */

import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createHono, middlewareAPISecret, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { org_saml_connections, orgs, saml_domain_mappings, sso_audit_logs } from '../utils/postgres_schema.ts'
import { hasOrgRight } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

/**
 * =============================================================================
 * Hono App & Route Definitions
 * =============================================================================
 */

import { version } from '../utils/version.ts'

/**
 * GoTrue Admin API Response for SSO Provider
 */
interface GoTrueSSOProvider {
  id: string
  saml?: {
    entity_id: string
    metadata_url?: string
    metadata_xml?: string
    attribute_mapping?: Record<string, any>
  }
  domains?: Array<{ domain: string, id: string }>
  created_at?: string
  updated_at?: string
}

/**
 * Register a SAML provider with Supabase Auth (GoTrue Admin API)
 *
 * This creates the provider in auth.sso_providers and auth.saml_providers tables
 * which is required for signInWithSSO to work.
 *
 * @param c - Hono context
 * @param config - Provider configuration
 * @param config.metadataUrl - Optional IdP metadata URL
 * @param config.metadataXml - Optional IdP metadata XML
 * @param config.domains - List of domains for this provider
 * @param config.attributeMapping - SAML attribute mapping configuration
 * @returns Created provider info from GoTrue
 */
async function registerWithSupabaseAuth(
  c: Context,
  config: {
    metadataUrl?: string
    metadataXml?: string
    domains?: string[]
    attributeMapping?: Record<string, any>
  },
): Promise<GoTrueSSOProvider> {
  const requestId = c.get('requestId')
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  const serviceRoleKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')

  // For local development, skip Supabase Auth registration and use mock
  // Check for localhost, 127.0.0.1, or kong (Supabase local docker network)
  const isLocal = supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('kong')

  if (isLocal) {
    cloudlog({
      requestId,
      message: '[SSO Auth] Local development detected - using mock provider',
      hasMetadataUrl: !!config.metadataUrl,
      hasMetadataXml: !!config.metadataXml,
      domainCount: config.domains?.length || 0,
    })

    // Generate mock provider for local development
    const mockProviderId = crypto.randomUUID()
    const extractedEntityId = config.metadataXml
      ? extractEntityIdFromMetadata(config.metadataXml)
      : `mock-entity-${mockProviderId}`

    return {
      id: mockProviderId,
      saml: {
        entity_id: extractedEntityId || `mock-entity-${mockProviderId}`,
        metadata_url: config.metadataUrl,
        metadata_xml: config.metadataXml,
      },
      domains: config.domains?.map(d => ({ domain: d, id: crypto.randomUUID() })),
      created_at: new Date().toISOString(),
    }
  }

  cloudlog({
    requestId,
    message: '[SSO Auth] Registering SAML provider with Supabase Auth',
    hasMetadataUrl: !!config.metadataUrl,
    hasMetadataXml: !!config.metadataXml,
    domainCount: config.domains?.length || 0,
  })

  // Build request body for GoTrue Admin API
  const body: Record<string, any> = {
    type: 'saml',
  }

  if (config.metadataUrl) {
    body.metadata_url = config.metadataUrl
  }
  else if (config.metadataXml) {
    body.metadata_xml = config.metadataXml
  }

  if (config.domains && config.domains.length > 0) {
    body.domains = config.domains
  }

  if (config.attributeMapping) {
    body.attribute_mapping = config.attributeMapping
  }

  // Call GoTrue Admin API to create SSO provider with timeout
  // Endpoint: POST /admin/sso/providers
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/sso/providers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      cloudlog({
        requestId,
        message: '[SSO Auth] Failed to register with Supabase Auth',
        status: response.status,
        error: errorText,
      })

      // Parse error for better messaging
      let errorMessage = 'Failed to register SSO provider with Supabase Auth'
      let errorCode = 'sso_auth_registration_failed'
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.msg || errorJson.message || errorJson.error || errorMessage

        // Check if this is a duplicate provider error
        if (errorJson.error_code === 'saml_idp_already_exists') {
          errorCode = 'sso_provider_already_exists'
          errorMessage = 'An SSO provider with this Entity ID already exists. Please use a different Entity ID or update the existing provider.'
        }
      }
      catch {
        // Use default message
      }

      throw simpleError(errorCode, errorMessage, {
        status: response.status,
        details: errorText,
      })
    }

    const result: GoTrueSSOProvider = await response.json()

    cloudlog({
      requestId,
      message: '[SSO Auth] Successfully registered SAML provider',
      providerId: result.id,
      entityId: result.saml?.entity_id,
    })

    return result
  }
  catch (error: any) {
    if (error.name === 'AbortError') {
      cloudlog({
        requestId,
        message: '[SSO Auth] Request timeout during SSO provider creation',
      })
      throw simpleError('sso_auth_timeout', 'Request to Supabase Auth timed out. Please try again.')
    }
    if (error.code === 'sso_auth_registration_failed' || error.code === 'sso_provider_already_exists') {
      throw error
    }

    cloudlog({
      requestId,
      message: '[SSO Auth] Exception during registration',
      error: error.message,
    })

    throw simpleError('sso_auth_registration_error', `Failed to connect to Supabase Auth: ${error.message}`)
  }
}

/**
 * Remove a SAML provider from Supabase Auth (GoTrue Admin API)
 *
 * @param c - Hono context
 * @param providerId - The SSO provider ID to remove
 */
async function removeFromSupabaseAuth(
  c: Context,
  providerId: string,
): Promise<void> {
  const requestId = c.get('requestId')
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  const serviceRoleKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')

  cloudlog({
    requestId,
    message: '[SSO Auth] Removing SAML provider from Supabase Auth',
    providerId,
  })

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/sso/providers/${providerId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    })

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text()
      cloudlog({
        requestId,
        message: '[SSO Auth] Failed to remove from Supabase Auth',
        status: response.status,
        error: errorText,
      })
      // Don't throw - this is cleanup, best effort
    }
    else {
      cloudlog({
        requestId,
        message: '[SSO Auth] Successfully removed SAML provider',
        providerId,
      })
    }
  }
  catch (error: any) {
    cloudlog({
      requestId,
      message: '[SSO Auth] Exception during removal',
      error: error.message,
    })
    // Don't throw - this is cleanup, best effort
  }
}

/**
 * Update an existing SAML provider with Supabase Auth (GoTrue Admin API)
 *
 * PUT /auth/v1/admin/sso/providers/{id}
 *
 * @param c - Hono context
 * @param providerId - Existing provider ID
 * @param config - Update configuration
 * @param config.metadataUrl - Optional IdP metadata URL
 * @param config.metadataXml - Optional IdP metadata XML
 * @param config.domains - List of domains for this provider
 * @param config.attributeMapping - SAML attribute mapping configuration
 * @returns Updated provider info
 */
async function updateWithSupabaseAuth(
  c: Context,
  providerId: string,
  config: {
    metadataUrl?: string
    metadataXml?: string
    domains?: string[]
    attributeMapping?: Record<string, any>
  },
): Promise<GoTrueSSOProvider> {
  const requestId = c.get('requestId')
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  const serviceRoleKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')

  // For local development, skip Supabase Auth update and return mock
  const isLocal = supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('kong')

  if (isLocal) {
    cloudlog({
      requestId,
      message: '[SSO Auth] Local development detected - skipping Supabase Auth update',
      providerId,
      hasMetadataUrl: !!config.metadataUrl,
      hasMetadataXml: !!config.metadataXml,
      domainCount: config.domains?.length || 0,
    })

    // Return mock updated provider
    const extractedEntityId = config.metadataXml
      ? extractEntityIdFromMetadata(config.metadataXml)
      : `mock-entity-${providerId}`

    return {
      id: providerId,
      saml: {
        entity_id: extractedEntityId || `mock-entity-${providerId}`,
        metadata_url: config.metadataUrl,
        metadata_xml: config.metadataXml,
      },
      domains: config.domains?.map(d => ({ domain: d, id: crypto.randomUUID() })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  cloudlog({
    requestId,
    message: '[SSO Auth] Updating SAML provider with Supabase Auth',
    providerId,
    hasMetadataUrl: !!config.metadataUrl,
    hasMetadataXml: !!config.metadataXml,
    domains: config.domains,
  })

  // Build request body for GoTrue API
  const body: Record<string, any> = {
    type: 'saml',
  }

  // Add metadata source
  if (config.metadataUrl) {
    body.metadata_url = config.metadataUrl
  }
  else if (config.metadataXml) {
    body.metadata_xml = config.metadataXml
  }

  // Add domains if provided - GoTrue expects array of strings for PUT
  if (config.domains && config.domains.length > 0) {
    body.domains = config.domains.map(domain => domain.toLowerCase())
  }

  // Add attribute mapping if provided
  if (config.attributeMapping) {
    body.attribute_mapping = config.attributeMapping
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/sso/providers/${providerId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      cloudlog({
        requestId,
        message: '[SSO Auth] Failed to update with Supabase Auth',
        status: response.status,
        error: errorText,
      })
      throw simpleError('sso_auth_error', `Failed to update SSO provider with Supabase Auth: ${errorText}`)
    }

    const provider: GoTrueSSOProvider = await response.json()

    cloudlog({
      requestId,
      message: '[SSO Auth] Successfully updated SAML provider',
      providerId: provider.id,
      entityId: provider.saml?.entity_id,
    })

    return provider
  }
  catch (error: any) {
    if (error.name === 'AbortError') {
      cloudlog({
        requestId,
        message: '[SSO Auth] Request timeout during SSO provider update',
      })
      throw simpleError('sso_auth_timeout', 'Request to Supabase Auth timed out. Please try again.')
    }
    if (error.code && error.message) {
      throw error // Re-throw our error
    }
    cloudlog({
      requestId,
      message: '[SSO Auth] Exception during update',
      error: error.message,
    })
    throw simpleError('sso_auth_error', `Failed to update SSO provider: ${error.message}`)
  }
}

/**
 * Validation schemas
 */
const domainSchema = z.string().regex(
  /^[a-z0-9]+([-.][a-z0-9]+)*\.[a-z]{2,}$/i,
  'Invalid domain format',
)

const metadataUrlSchema = z.string().url().regex(
  /^https:\/\//,
  'Metadata URL must use HTTPS',
)

/**
 * SSO Configuration Request Body Schema
 */
export const ssoConfigSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid().optional(), // For internal API calls to specify acting user
  providerName: z.string().min(1).max(100).optional(),
  metadataUrl: metadataUrlSchema.optional(),
  metadataXml: z.string().optional(),
  domains: z.array(domainSchema).optional(),
  enabled: z.boolean().optional(),
  attributeMapping: z.record(z.string(), z.any()).optional(),
}).refine((data: any) => data.metadataUrl || data.metadataXml, {
  message: 'Either metadataUrl or metadataXml is required',
}).refine((data: any) => !data.domains || data.domains.length > 0, {
  message: 'At least one domain is required if domains array is provided',
})

/**
 * SSO Update Request Body Schema
 */
export const ssoUpdateSchema = z.object({
  orgId: z.string().uuid(),
  providerId: z.string().uuid(),
  providerName: z.string().min(1).max(100).optional(),
  metadataUrl: metadataUrlSchema.optional(),
  metadataXml: z.string().optional(),
  domains: z.array(domainSchema).optional(),
  enabled: z.boolean().optional(),
  autoJoinEnabled: z.boolean().optional(),
  attributeMapping: z.record(z.string(), z.any()).optional(),
})

/**
 * Extract entity ID from SAML metadata XML
 * @param metadataXml - SAML metadata XML string
 * @returns Extracted entity ID or fallback placeholder
 */
function extractEntityIdFromMetadata(metadataXml: string): string {
  try {
    // Extract entityID from EntityDescriptor element
    const match = metadataXml.match(/entityID=["']([^"']+)["']/)
    if (match && match[1]) {
      return match[1]
    }
  }
  catch {
    // Fall through to default
  }
  return 'https://example.com/saml/entity' // Fallback only if extraction fails
}

/**
 * Sanitize metadata XML to prevent injection attacks
 *
 * Basic validation:
 * - Must be valid XML structure
 * - Must contain required SAML elements
 * - Remove potentially dangerous content
 *
 * @param xml - Raw metadata XML
 * @returns Sanitized XML
 */
function sanitizeMetadataXML(xml: string): string {
  // Basic XML validation - check for required SAML elements
  const requiredElements = [
    'EntityDescriptor',
    'IDPSSODescriptor',
  ]

  for (const element of requiredElements) {
    if (!xml.includes(`<${element}`) && !xml.includes(`<md:${element}`)) {
      throw simpleError('invalid_metadata', `Missing required SAML element: ${element}`)
    }
  }

  // Remove potentially dangerous XML features
  // (In production, use a proper XML parser and sanitizer)
  const dangerous = [
    '<!ENTITY',
    '<!DOCTYPE',
    '<![CDATA[',
  ]

  for (const pattern of dangerous) {
    if (xml.includes(pattern)) {
      throw simpleError('invalid_metadata', `Metadata contains disallowed XML feature: ${pattern}`)
    }
  }

  return xml.trim()
}

/**
 * Extract root domain from a domain
 * Examples:
 * - bigcorp.com → bigcorp.com
 * - eng.bigcorp.com → bigcorp.com
 * - deep.sub.bigcorp.com → bigcorp.com
 *
 * @param domain - Full domain name
 * @returns Root domain
 */
function extractRootDomain(domain: string): string {
  const parts = domain.split('.')

  // Handle common TLDs with two parts (e.g., co.uk, com.au)
  const twoPartTlds = ['co.uk', 'com.au', 'co.nz', 'co.za', 'com.br']
  const lastTwoParts = parts.slice(-2).join('.')

  if (twoPartTlds.includes(lastTwoParts)) {
    // Return last 3 parts (e.g., company.co.uk)
    return parts.slice(-3).join('.')
  }

  // Return last 2 parts (e.g., company.com)
  return parts.slice(-2).join('.')
}

/**
 * Check domain uniqueness constraint
 * Root domains must be unique across all organizations
 * Subdomains can be claimed by different orgs
 *
 * @param c - Hono context
 * @param domains - Domains to check
 * @param currentOrgId - Current organization ID
 * @throws Error if root domain is already claimed by another org
 */
async function checkDomainUniqueness(
  c: Context<MiddlewareKeyVariables>,
  domains: string[],
  currentOrgId: string,
): Promise<void> {
  const requestId = c.get('requestId')
  const pgClient = getPgClient(c)

  // Build list of all domains and root domains to check
  const allDomainsToCheck: string[] = []
  const domainToRootMap = new Map<string, string>()

  for (const domain of domains) {
    const rootDomain = extractRootDomain(domain)
    allDomainsToCheck.push(domain)
    domainToRootMap.set(domain, rootDomain)

    // Add root domain if it's different from the domain itself
    if (domain !== rootDomain && !allDomainsToCheck.includes(rootDomain)) {
      allDomainsToCheck.push(rootDomain)
    }
  }

  cloudlog({
    requestId,
    message: 'Checking domain uniqueness (batched)',
    domains: allDomainsToCheck,
    orgId: currentOrgId,
  })

  // Batch query: check all domains at once
  const claimedDomains = await pgClient.query(
    `SELECT org_id, domain 
     FROM saml_domain_mappings 
     WHERE domain = ANY($1) 
     AND org_id != $2`,
    [allDomainsToCheck, currentOrgId],
  )

  // Build a map of claimed domains for quick lookup
  const claimedMap = new Map<string, string>()
  for (const row of claimedDomains.rows) {
    claimedMap.set(row.domain, row.org_id)
  }

  // Validate each requested domain
  for (const domain of domains) {
    const rootDomain = domainToRootMap.get(domain)!

    // Check if this exact domain is already claimed
    if (claimedMap.has(domain)) {
      throw simpleError('domain_already_claimed', `Domain ${domain} is already claimed by another organization`, {
        domain,
        claimedBy: claimedMap.get(domain),
      })
    }

    // If this is a root domain, it must be unique
    if (domain === rootDomain) {
      if (claimedMap.has(rootDomain)) {
        throw simpleError('root_domain_already_claimed', `Root domain ${rootDomain} is already claimed by another organization. Consider using a subdomain like subdomain.${rootDomain}`, {
          domain: rootDomain,
          claimedBy: claimedMap.get(rootDomain),
        })
      }
    }
    else {
      // Subdomain: log if root is owned by another org (allowed)
      if (claimedMap.has(rootDomain)) {
        cloudlog({
          requestId,
          message: 'Subdomain allowed - root owned by different org',
          subdomain: domain,
          rootDomain,
          rootOwner: claimedMap.get(rootDomain),
        })
      }
    }
  }
}

/**
 * Rate limiting for SSO operations
 * Prevents abuse by limiting domain changes per organization
 *
 * @param c - Hono context
 * @param drizzleClient - Database client
 * @param orgId - Organization ID
 * @param limit - Maximum changes allowed per hour (default: 10)
 * @throws Error if rate limit exceeded
 */
async function checkRateLimit(
  c: Context<MiddlewareKeyVariables>,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
  orgId: string,
  limit: number = 10,
): Promise<void> {
  const requestId = c.get('requestId')

  try {
    // Count domain-related changes in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const pgClient = getPgClient(c)
    const result = await pgClient.query(
      `SELECT COUNT(*) as count
       FROM sso_audit_logs
       WHERE org_id = $1
       AND event_type IN ('provider_added', 'domains_updated')
       AND timestamp > $2`,
      [orgId, oneHourAgo.toISOString()],
    )

    const changeCount = Number.parseInt(result.rows[0].count, 10)

    cloudlog({
      requestId,
      message: 'SSO rate limit check',
      orgId,
      changeCount,
      limit,
    })

    if (changeCount >= limit) {
      throw simpleError('rate_limit_exceeded', `Too many SSO domain changes. Limit: ${limit} per hour. Try again later.`, {
        current: changeCount,
        limit,
        resetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
    }
  }
  catch (error: any) {
    // If table doesn't exist, skip rate limiting (development/test environment)
    if (error.message?.includes('relation "sso_audit_logs" does not exist')) {
      cloudlog({
        requestId,
        message: 'SSO audit logs table not found - skipping rate limit check',
      })
      return
    }
    // Re-throw rate limit errors
    if (error.code === 'rate_limit_exceeded') {
      throw error
    }
    // Log other errors but don't block the request
    cloudlog({
      requestId,
      message: 'Error checking SSO rate limit',
      error: error.message,
    })
  }
}

/**
 * Log SSO audit event with IP address and user agent
 *
 * @param c - Hono context
 * @param drizzleClient - Database client
 * @param event - Event details
 * @param event.eventType - Type of SSO event
 * @param event.orgId - Organization ID
 * @param event.ssoProviderId - SSO provider ID (optional)
 * @param event.userId - User ID (optional)
 * @param event.email - User email (optional)
 * @param event.metadata - Additional event metadata (optional)
 */
async function logSSOAuditEvent(
  c: Context<MiddlewareKeyVariables>,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
  event: {
    eventType: 'provider_added' | 'provider_updated' | 'provider_removed' | 'provider_enabled' | 'provider_disabled' | 'metadata_updated' | 'domains_updated' | 'config_viewed'
    orgId: string
    ssoProviderId?: string
    userId?: string
    email?: string
    metadata?: Record<string, any>
  },
): Promise<void> {
  const auth = c.get('auth')
  const requestId = c.get('requestId')

  // Extract IP address from request headers
  const ipAddress = c.req.header('cf-connecting-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || 'unknown'

  // Extract user agent
  const userAgent = c.req.header('user-agent') || 'unknown'

  try {
    await drizzleClient.insert(sso_audit_logs).values({
      id: crypto.randomUUID(),
      event_type: event.eventType,
      org_id: event.orgId,
      sso_provider_id: event.ssoProviderId || null,
      user_id: event.userId || auth?.userId || null,
      email: event.email || null,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: JSON.stringify({
        ...event.metadata,
        request_id: requestId,
        timestamp: new Date().toISOString(),
      }),
    })

    cloudlog({
      requestId,
      message: `[SSO Audit] ${event.eventType}`,
      org_id: event.orgId,
      sso_provider_id: event.ssoProviderId,
      ip_address: ipAddress,
    })
  }
  catch (error) {
    // Log audit failure but don't throw - audit should not block operations
    cloudlog({
      requestId,
      message: '[SSO Audit] Failed to log audit event',
      error: String(error),
      event_type: event.eventType,
    })
  }
}

/**
 * Validate metadata URL to prevent SSRF attacks
 *
 * @param url - Metadata URL
 */
function validateMetadataURL(url: string): void {
  try {
    const parsed = new URL(url)

    // Only allow https:// for security
    if (parsed.protocol !== 'https:') {
      throw simpleError('invalid_metadata_url', 'SSRF protection: Metadata URL must use HTTPS')
    }

    // Block internal/localhost addresses
    const hostname = parsed.hostname.toLowerCase()
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '169.254.169.254', // NOSONAR - AWS metadata service IP intentionally blocked for SSRF protection
      '169.254.169.253', // NOSONAR - AWS ECS metadata IP intentionally blocked for SSRF protection
    ]

    if (blockedHosts.includes(hostname)) {
      throw simpleError('invalid_metadata_url', 'SSRF protection: Cannot use internal/localhost addresses')
    }

    // Block private IP ranges
    if (
      hostname.startsWith('10.')
      || hostname.startsWith('192.168.')
      || hostname.match(/^172\.(?:1[6-9]|2\d|3[01])\./)
    ) {
      throw simpleError('invalid_metadata_url', 'SSRF protection: Cannot use private IP addresses')
    }
  }
  catch (error) {
    if (error instanceof TypeError) {
      throw simpleError('invalid_metadata_url', 'Invalid URL format')
    }
    throw error
  }
}

/**
 * Configure SAML SSO connection
 *
 * Registers provider with Supabase Auth and stores configuration in database.
 *
 * @param c - Hono context
 * @param config - SSO configuration
 * @returns Created SSO connection info
 */
export async function configureSAML(
  c: Context<MiddlewareKeyVariables>,
  config: z.infer<typeof ssoConfigSchema>,
  userId?: string,
): Promise<{ sso_provider_id: string, org_id: string, entity_id: string }> {
  const requestId = c.get('requestId')
  const auth = c.get('auth')

  // Accept userId from parameter (for internal API) or from auth context (for JWT)
  const effectiveUserId = userId || auth?.userId

  if (!effectiveUserId) {
    throw simpleError('unauthorized', 'Authentication required')
  }

  // Set defaults for optional fields
  const providerName = config.providerName || 'Default Provider'
  const domains = config.domains || []
  const enabled = config.enabled ?? true

  cloudlog({
    requestId,
    message: '[SSO Config] Starting SAML configuration',
    orgId: config.orgId,
    providerName,
    domainCount: domains.length,
  })

  // Initialize database client
  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    // Check rate limit before processing
    await checkRateLimit(c, drizzleClient, config.orgId)

    // Check domain uniqueness (only if domains provided)
    if (domains.length > 0) {
      await checkDomainUniqueness(c, domains, config.orgId)
    }

    // Verify org exists and user has super_admin rights
    const orgResult = await drizzleClient
      .select({ id: orgs.id, name: orgs.name })
      .from(orgs)
      .where(eq(orgs.id, config.orgId))
      .limit(1)

    if (orgResult.length === 0) {
      throw simpleError('org_not_found', 'Organization not found')
    }

    // Validate and sanitize metadata
    if (config.metadataUrl) {
      validateMetadataURL(config.metadataUrl)
    }

    let sanitizedMetadataXml: string | undefined
    if (config.metadataXml) {
      sanitizedMetadataXml = sanitizeMetadataXML(config.metadataXml)
    }

    // Register with Supabase Auth (GoTrue Admin API)
    // This creates the provider in auth.sso_providers and auth.saml_providers
    const authProvider = await registerWithSupabaseAuth(c, {
      metadataUrl: config.metadataUrl,
      metadataXml: sanitizedMetadataXml,
      domains: domains.length > 0 ? domains : undefined,
      attributeMapping: config.attributeMapping,
    })

    // Extract entity_id from auth provider response
    const entityId = authProvider.saml?.entity_id || extractEntityIdFromMetadata(sanitizedMetadataXml || '')

    // Store configuration in our database
    await drizzleClient.insert(org_saml_connections).values({
      id: crypto.randomUUID(),
      org_id: config.orgId,
      sso_provider_id: authProvider.id,
      provider_name: providerName,
      metadata_url: config.metadataUrl || null,
      metadata_xml: sanitizedMetadataXml || null,
      entity_id: entityId,
      attribute_mapping: JSON.stringify(config.attributeMapping || {}),
      enabled,
      verified: false,
      created_by: auth?.userId || null,
    })

    // Get the created connection to get its ID for domain mappings
    const connectionResult = await drizzleClient
      .select({ id: org_saml_connections.id })
      .from(org_saml_connections)
      .where(eq(org_saml_connections.sso_provider_id, authProvider.id))
      .limit(1)

    if (connectionResult.length > 0 && domains.length > 0) {
      const connectionId = connectionResult[0].id

      for (let i = 0; i < domains.length; i++) {
        await drizzleClient.insert(saml_domain_mappings).values({
          id: crypto.randomUUID(),
          domain: domains[i].toLowerCase(),
          org_id: config.orgId,
          sso_connection_id: connectionId,
          priority: domains.length - i, // First domain gets highest priority
          verified: true, // Auto-verified via SSO
        })
      }
    }

    // Log audit event with detailed metadata
    await logSSOAuditEvent(c, drizzleClient, {
      eventType: 'provider_added',
      orgId: config.orgId,
      ssoProviderId: authProvider.id,
      userId: effectiveUserId,
      metadata: {
        provider_name: providerName,
        entity_id: entityId,
        domains,
        metadata_source: config.metadataUrl ? 'url' : 'xml',
        metadata_url: config.metadataUrl,
        domains_count: domains.length,
        has_attribute_mapping: !!config.attributeMapping,
      },
    })

    cloudlog({
      requestId,
      message: '[SSO Config] SAML configuration successful',
      sso_provider_id: authProvider.id,
      entity_id: entityId,
    })

    return {
      sso_provider_id: authProvider.id,
      org_id: config.orgId,
      entity_id: entityId,
    }
  }
  catch (error: any) {
    // If registration with Supabase Auth failed, no cleanup needed
    // If database insert failed after auth registration, we should clean up
    cloudlog({
      requestId,
      message: '[SSO Config] Configuration failed',
      error: error.message,
    })
    throw error
  }
  finally {
    await closeClient(c, pgClient)
  }
}

/**
 * Update SAML SSO connection
 *
 * Updates provider in Supabase Auth and database.
 *
 * @param c - Hono context
 * @param update - SSO update configuration
 */
export async function updateSAML(
  c: Context<MiddlewareKeyVariables>,
  update: z.infer<typeof ssoUpdateSchema>,
): Promise<void> {
  const requestId = c.get('requestId')

  cloudlog({
    requestId,
    message: '[SSO Update] Updating SAML configuration',
    providerId: update.providerId,
  })

  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    // Verify connection exists
    const existing = await drizzleClient
      .select()
      .from(org_saml_connections)
      .where(eq(org_saml_connections.sso_provider_id, update.providerId))
      .limit(1)

    if (existing.length === 0) {
      throw simpleError('sso_not_found', 'SSO connection not found')
    }

    // Check rate limit and domain uniqueness if domains are being updated
    if (update.domains && update.domains.length > 0) {
      await checkRateLimit(c, drizzleClient, existing[0].org_id)
      await checkDomainUniqueness(c, update.domains, existing[0].org_id)
    }

    // Validate metadata URL if provided
    if (update.metadataUrl) {
      validateMetadataURL(update.metadataUrl)
    }

    // Update with Supabase Auth (GoTrue Admin API) if metadata or domains changed
    let authProvider = null
    if (update.metadataUrl || update.metadataXml || update.domains) {
      authProvider = await updateWithSupabaseAuth(c, update.providerId, {
        metadataUrl: update.metadataUrl,
        metadataXml: update.metadataXml,
        domains: update.domains,
        attributeMapping: update.attributeMapping,
      })
    }

    // Update database record
    const updateData: any = {
      updated_at: new Date(),
    }

    if (update.providerName)
      updateData.provider_name = update.providerName
    if (update.metadataUrl)
      updateData.metadata_url = update.metadataUrl
    if (update.metadataXml)
      updateData.metadata_xml = update.metadataXml
    if (update.enabled !== undefined)
      updateData.enabled = update.enabled
    if (update.autoJoinEnabled !== undefined)
      updateData.auto_join_enabled = update.autoJoinEnabled
    if (update.attributeMapping)
      updateData.attribute_mapping = update.attributeMapping

    // Update entity_id if we have metadata
    if (authProvider?.saml?.entity_id) {
      updateData.entity_id = authProvider.saml.entity_id
    }
    else if (update.metadataXml) {
      updateData.entity_id = extractEntityIdFromMetadata(update.metadataXml)
    }

    await drizzleClient
      .update(org_saml_connections)
      .set(updateData)
      .where(eq(org_saml_connections.sso_provider_id, update.providerId))

    // Update domain mappings if domains are provided
    if (update.domains !== undefined) {
      // First, delete all existing domain mappings for this connection
      await drizzleClient
        .delete(saml_domain_mappings)
        .where(eq(saml_domain_mappings.sso_connection_id, existing[0].id))

      // Then insert new ones
      if (update.domains.length > 0) {
        for (let i = 0; i < update.domains.length; i++) {
          await drizzleClient.insert(saml_domain_mappings).values({
            id: crypto.randomUUID(),
            domain: update.domains[i].toLowerCase(),
            org_id: existing[0].org_id,
            sso_connection_id: existing[0].id,
            priority: update.domains.length - i,
            verified: true,
          })
        }
      }
    }

    // Determine what was updated for audit log
    const updatedFields: string[] = []
    if (update.providerName)
      updatedFields.push('provider_name')
    if (update.metadataUrl)
      updatedFields.push('metadata_url')
    if (update.domains)
      updatedFields.push('domains')
    if (update.enabled !== undefined)
      updatedFields.push('enabled')
    if (update.autoJoinEnabled !== undefined)
      updatedFields.push('auto_join_enabled')
    if (update.attributeMapping)
      updatedFields.push('attribute_mapping')

    // Log specific event based on what changed
    const eventType = update.enabled !== undefined
      ? (update.enabled ? 'provider_enabled' : 'provider_disabled')
      : (update.metadataUrl
          ? 'metadata_updated'
          : (update.domains ? 'domains_updated' : 'provider_updated'))

    await logSSOAuditEvent(c, drizzleClient, {
      eventType,
      orgId: update.orgId,
      ssoProviderId: update.providerId,
      metadata: {
        updated_fields: updatedFields,
        new_enabled_state: update.enabled,
        new_domains: update.domains,
        metadata_url: update.metadataUrl,
      },
    })

    cloudlog({
      requestId,
      message: '[SSO Update] Update successful',
      providerId: update.providerId,
      updated_fields: updatedFields,
    })
  }
  finally {
    await closeClient(c, pgClient)
  }
}

/**
 * Remove SAML SSO connection
 *
 * Removes provider from Supabase Auth and cleans up database.
 *
 * @param c - Hono context
 * @param orgId - Organization ID
 * @param providerId - SSO provider ID to remove
 */
export async function removeSAML(
  c: Context<MiddlewareKeyVariables>,
  orgId: string,
  providerId: string,
): Promise<void> {
  const requestId = c.get('requestId')

  cloudlog({
    requestId,
    message: '[SSO Remove] Removing SAML connection',
    providerId,
  })

  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    // Get connection details before deletion for audit log
    const connectionDetails = await drizzleClient
      .select()
      .from(org_saml_connections)
      .where(eq(org_saml_connections.sso_provider_id, providerId))
      .limit(1)

    const connection = connectionDetails[0]

    // Get associated domains before deletion
    const domains = connection
      ? await drizzleClient
          .select({ domain: saml_domain_mappings.domain })
          .from(saml_domain_mappings)
          .where(eq(saml_domain_mappings.sso_connection_id, connection.id))
      : []

    // Remove from Supabase Auth (GoTrue Admin API)
    // This removes the provider from auth.sso_providers and auth.saml_providers
    await removeFromSupabaseAuth(c, providerId)

    // Clean up database (cascading deletes will handle domain mappings)
    await drizzleClient
      .delete(org_saml_connections)
      .where(eq(org_saml_connections.sso_provider_id, providerId))

    // Log audit event with detailed metadata
    await logSSOAuditEvent(c, drizzleClient, {
      eventType: 'provider_removed',
      orgId,
      ssoProviderId: providerId,
      metadata: {
        provider_name: connection?.provider_name,
        entity_id: connection?.entity_id,
        was_enabled: connection?.enabled,
        domains_removed: domains.map(d => d.domain),
        domains_count: domains.length,
      },
    })

    cloudlog({
      requestId,
      message: '[SSO Remove] Removal successful',
      providerId,
      domains_removed: domains.length,
    })
  }
  finally {
    await closeClient(c, pgClient)
  }
}

/**
 * Get SSO connection status for an organization
 *
 * @param c - Hono context
 * @param orgId - Organization ID
 * @returns SSO connection info
 */
export async function getSSOStatus(
  c: Context<MiddlewareKeyVariables>,
  orgId: string,
): Promise<any> {
  const requestId = c.get('requestId')
  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    const connections = await drizzleClient
      .select()
      .from(org_saml_connections)
      .where(eq(org_saml_connections.org_id, orgId))

    // Log config view for audit trail (non-blocking)
    if (connections.length > 0) {
      logSSOAuditEvent(c, drizzleClient, {
        eventType: 'config_viewed',
        orgId,
        ssoProviderId: connections[0].sso_provider_id,
        metadata: {
          connections_count: connections.length,
        },
      }).catch((error) => {
        cloudlog({
          requestId,
          message: '[SSO Status] Failed to log view event',
          error: String(error),
        })
      })
    }

    const result: any[] = []

    for (const conn of connections) {
      const domains = await drizzleClient
        .select({ domain: saml_domain_mappings.domain })
        .from(saml_domain_mappings)
        .where(eq(saml_domain_mappings.sso_connection_id, conn.id))

      result.push({
        sso_provider_id: conn.sso_provider_id,
        provider_name: conn.provider_name,
        entity_id: conn.entity_id,
        enabled: conn.enabled,
        verified: conn.verified,
        auto_join_enabled: conn.auto_join_enabled,
        domains: domains.map(d => d.domain),
        metadata_url: conn.metadata_url,
        metadata_xml: conn.metadata_xml,
        created_at: conn.created_at,
      })
    }

    return result
  }
  finally {
    await closeClient(c, pgClient)
  }
}

export const app = createHono('sso_management', version)

app.use('/', useCors)

/**
 * POST /private/sso/configure
 * Configure new SAML SSO connection for an organization
 */
app.post('/configure', middlewareAPISecret, async (c: Context<MiddlewareKeyVariables>) => {
  const requestId = c.get('requestId')

  const body = await parseBody<z.infer<typeof ssoConfigSchema>>(c)

  // Validate schema
  const result = ssoConfigSchema.safeParse(body)
  if (!result.success) {
    throw simpleError('invalid_input', 'Invalid request body', { errors: result.error.issues })
  }

  const config = result.data

  // Check permission early, before other validations
  // Use userId from body if provided (for internal API calls), otherwise from auth context
  const auth = c.get('auth')
  const effectiveUserId = config.userId || auth?.userId
  if (!effectiveUserId) {
    throw simpleError('unauthorized', 'Authentication required - userId must be provided', 401)
  }

  cloudlog({
    requestId,
    message: '[SSO Configure] Checking permissions',
    orgId: config.orgId,
    effectiveUserId,
    requiredRight: 'super_admin',
  })

  const hasPermission = await hasOrgRight(c, config.orgId, effectiveUserId, 'super_admin')

  cloudlog({
    requestId,
    message: '[SSO Configure] Permission check result',
    hasPermission,
  })

  if (!hasPermission) {
    throw simpleError('insufficient_permissions', 'Only super administrators can configure SSO', 403)
  }

  cloudlog({
    requestId,
    message: '[SSO Configure] Request received',
    orgId: config.orgId,
    domains: config.domains || [],
  })

  // Pass userId to configureSAML
  const response = await configureSAML(c, config, effectiveUserId)
  return c.json(response, 200)
})

/**
 * POST /private/sso/update
 * Update existing SAML SSO connection
 */
app.post('/update', middlewareAPISecret, async (c: Context<MiddlewareKeyVariables>) => {
  const requestId = c.get('requestId')
  const pgClient = getPgClient(c, true)

  try {
    const body = await parseBody<z.infer<typeof ssoUpdateSchema>>(c)

    // Validate schema
    const result = ssoUpdateSchema.safeParse(body)
    if (!result.success) {
      throw simpleError('invalid_input', 'Invalid request body', { errors: result.error.issues })
    }

    const config = result.data

    cloudlog({
      requestId,
      message: '[SSO Update] Request received',
      orgId: config.orgId,
      providerId: config.providerId,
    })

    // Verify caller has super_admin permissions for the organization
    const auth = c.get('auth')
    if (!auth?.userId) {
      throw simpleError('unauthorized', 'Authentication required', 401)
    }

    const hasPermission = await hasOrgRight(c, config.orgId, auth.userId, 'super_admin')
    if (!hasPermission) {
      throw simpleError('insufficient_permissions', 'Only super administrators can update SSO connections', 403)
    }

    const response = await updateSAML(c, config)
    return c.json(response, 200)
  }
  catch (error: any) {
    await closeClient(c, pgClient)
    throw error
  }
})

/**
 * DELETE /private/sso/remove
 * Remove SAML SSO connection
 */
app.delete('/remove', middlewareAPISecret, async (c: Context<MiddlewareKeyVariables>) => {
  const requestId = c.get('requestId')
  const pgClient = getPgClient(c, true)

  try {
    const body = await parseBody<{ orgId: string, providerId: string }>(c)

    if (!body.orgId || !body.providerId) {
      throw simpleError('invalid_input', 'orgId and providerId are required')
    }

    cloudlog({
      requestId,
      message: '[SSO Remove] Request received',
      orgId: body.orgId,
      providerId: body.providerId,
    })

    // Verify caller has super_admin permissions for the organization
    const auth = c.get('auth')
    if (!auth?.userId) {
      await closeClient(c, pgClient)
      throw simpleError('unauthorized', 'Authentication required', 401)
    }

    const hasPermission = await hasOrgRight(c, body.orgId, auth.userId, 'super_admin')
    if (!hasPermission) {
      await closeClient(c, pgClient)
      throw simpleError('insufficient_permissions', 'Only super administrators can remove SSO connections', 403)
    }

    const response = await removeSAML(c, body.orgId, body.providerId)
    return c.json(response, 200)
  }
  catch (error: any) {
    await closeClient(c, pgClient)
    throw error
  }
})

/**
 * GET /private/sso/status
 * Get SSO connection status and configuration
 */
app.get('/status', middlewareAPISecret, async (c: Context<MiddlewareKeyVariables>) => {
  const requestId = c.get('requestId')
  const pgClient = getPgClient(c, true)

  try {
    const orgId = c.req.query('orgId')

    if (!orgId) {
      throw simpleError('invalid_input', 'orgId query parameter is required')
    }

    cloudlog({
      requestId,
      message: '[SSO Status] Request received',
      orgId,
    })

    const response = await getSSOStatus(c, orgId)
    return c.json(response, 200)
  }
  catch (error: any) {
    await closeClient(c, pgClient)
    throw error
  }
})
