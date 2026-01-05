// @ts-expect-error - Legacy Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json() as { email?: string }
    const { email } = body

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({
          error: 'invalid_email',
          message: 'Valid email address required',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Extract domain from email
    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain) {
      return new Response(
        JSON.stringify({
          error: 'invalid_email',
          message: 'Could not extract domain from email',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Skip public email providers
    const publicDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com']
    if (publicDomains.includes(domain)) {
      return new Response(
        JSON.stringify({
          available: false,
          provider_id: null,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Query database for SSO configuration
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data, error } = await supabaseClient
      .from('saml_domain_mappings')
      .select(`
        org_id,
        org_saml_connections!inner(
          id,
          entity_id,
          enabled,
          orgs!inner(
            id,
            name
          )
        )
      `)
      .eq('domain', domain)
      .eq('org_saml_connections.enabled', true)
      .limit(1)
      .single()

    if (error || !data) {
      return new Response(
        JSON.stringify({
          available: false,
          provider_id: null,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    const connection = data.org_saml_connections
    return new Response(
      JSON.stringify({
        available: true,
        provider_id: connection.id,
        entity_id: connection.entity_id,
        org_id: data.org_id,
        org_name: connection.orgs.name,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }
  catch {
    return new Response(
      JSON.stringify({
        error: 'internal_error',
        message: 'Failed to check SSO availability',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
