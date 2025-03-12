import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { checkAuth } from '../_backend/utils/auth.ts'
import { corsHeaders } from '../_backend/utils/cors.ts'
import { createClient } from '../_backend/utils/supabase.ts'
import { isValidUrl } from '../_backend/utils/validation.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { bundleId, link, comment } = await req.json()

    // Validate inputs
    if (!bundleId) {
      return new Response(
        JSON.stringify({ error: 'Bundle ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Validate URL if provided
    if (link && !isValidUrl(link)) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Check authentication
    const authResult = await checkAuth(req)
    if (!authResult.success) {
      return new Response(
        JSON.stringify({ error: authResult.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Create Supabase client
    const supabase = createClient(req)

    // Get bundle details to verify ownership
    const { data: bundle, error: bundleError } = await supabase
      .from('app_versions')
      .select('id, app_id, owner_org')
      .eq('id', bundleId)
      .single()

    if (bundleError || !bundle) {
      return new Response(
        JSON.stringify({ error: 'Bundle not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Check if user has permission to update this bundle
    const { data: userOrgs } = await supabase
      .from('org_users')
      .select('org_id, user_right')
      .eq('user_id', authResult.user.id)
      .in('user_right', ['admin', 'super_admin', 'write'])

    const hasPermission = userOrgs?.some(org =>
      org.org_id === bundle.owner_org
      && ['admin', 'super_admin', 'write'].includes(org.user_right),
    )

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Update bundle metadata
    const { error: updateError } = await supabase
      .from('app_versions')
      .update({
        link: link || null,
        comment: comment || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bundleId)

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update metadata' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Update deploy_history records for this version
    const { error: historyError } = await supabase
      .from('deploy_history')
      .update({
        link: link || null,
        comment: comment || null,
        updated_at: new Date().toISOString(),
      })
      .eq('version_id', bundleId)

    if (historyError) {
      console.error('Failed to update deploy_history:', historyError)
      // Continue even if deploy_history update fails
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
