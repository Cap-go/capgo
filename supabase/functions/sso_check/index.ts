/**
 * SSO Check Endpoint - POST /sso_check
 *
 * Public endpoint to check if SSO is configured for an email domain.
 * Used by the login UI to detect if SSO should be offered.
 *
 * Request Body:
 * {
 *   email: string
 * }
 *
 * Response:
 * {
 *   available: boolean
 *   provider_id?: string
 *   entity_id?: string
 *   org_id?: string
 *   org_name?: string
 * }
 */

import { createClient } from '@supabase/supabase-js'

interface SSOCheckRequest {
  email: string
}

interface SSOCheckResponse {
  available: boolean
  provider_id?: string
  entity_id?: string
  org_id?: string
  org_name?: string
}

Deno.serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Parse request body
    const body: SSOCheckRequest = await req.json()

    if (!body.email || !body.email.includes('@')) {
      return new Response(
        JSON.stringify({ available: false, error: 'Invalid email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Extract domain from email
    const domain = body.email.split('@')[1].toLowerCase()

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check if domain has SSO configured
    const { data: domainMapping, error: domainError } = await supabase
      .from('saml_domain_mappings')
      .select(`
        domain,
        sso_connection_id,
        verified,
        org_id,
        org_saml_connections!inner (
          id,
          sso_provider_id,
          entity_id,
          enabled,
          org_id,
          orgs!inner (
            id,
            name
          )
        )
      `)
      .eq('domain', domain)
      .eq('verified', true)
      .eq('org_saml_connections.enabled', true)
      .single()

    if (domainError || !domainMapping) {
      console.log('[SSO Check] No SSO configured for domain:', domain)
      return new Response(
        JSON.stringify({ available: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Access nested data - org_saml_connections is an object due to inner join
    const connection = domainMapping.org_saml_connections as any
    const org = Array.isArray(connection.orgs) ? connection.orgs[0] : connection.orgs

    console.log('[SSO Check] SSO available for domain:', domain, 'org:', org.name)

    const response: SSOCheckResponse = {
      available: true,
      provider_id: connection.sso_provider_id,
      entity_id: connection.entity_id,
      org_id: org.id,
      org_name: org.name,
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  catch (error: any) {
    console.error('[SSO Check] Error:', error)
    return new Response(
      JSON.stringify({ available: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
