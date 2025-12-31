/**
 * Mock SSO Callback Endpoint
 * 
 * This simulates Okta's SAML callback to Supabase for local development.
 * In production, Okta POSTs a SAML assertion to /auth/v1/sso/saml/acs
 * 
 * Flow:
 * 1. User clicks SSO login → Redirects to this mock endpoint
 * 2. Mock validates email domain and finds SSO provider
 * 3. Creates/authenticates user via Supabase admin API
 * 4. Generates session tokens
 * 5. Redirects back to app with access_token and refresh_token
 */

import { createClient } from '@supabase/supabase-js'

// Mock Okta SAML response structure
interface MockSAMLResponse {
    email: string
    firstName?: string
    lastName?: string
    providerId: string
    orgId: string
}

// Extract email from query params (simulates pre-filled form)
function getMockEmail(req: Request): string | null {
    const url = new URL(req.url)
    return url.searchParams.get('email')
}

// Get redirect URL from RelayState (SAML standard parameter)
function getRelayState(req: Request): string {
    const url = new URL(req.url)
    return url.searchParams.get('RelayState') || '/dashboard'
}

// Validate SSO provider configuration
async function validateSSOProvider(supabase: any, email: string): Promise<{ providerId: string, orgId: string } | null> {
    const domain = email.split('@')[1]

    // Check if domain has SSO configured
    const { data: domainMapping, error: domainError } = await supabase
        .from('saml_domain_mappings')
        .select(`
      domain,
      sso_connection_id,
      verified,
      org_saml_connections!inner (
        id,
        org_id,
        sso_provider_id,
        enabled,
        metadata_url,
        entity_id
      )
    `)
        .eq('domain', domain)
        .eq('verified', true)
        .eq('org_saml_connections.enabled', true)
        .single()

    if (domainError || !domainMapping) {
        console.error('SSO provider not found for domain:', domain, domainError)
        return null
    }

    return {
        providerId: domainMapping.org_saml_connections.sso_provider_id,
        orgId: domainMapping.org_saml_connections.org_id,
    }
}

// For local mock SSO: use admin API to create sessions directly
// This simulates the SSO flow without needing passwords
async function authenticateUser(supabaseAdmin: any, mockResponse: MockSAMLResponse): Promise<{ accessToken: string, refreshToken: string } | null> {
    console.log('[Mock SSO] Authenticating user:', mockResponse.email)

    // Check if user exists
    const { data: existingUsers, error: fetchError } = await supabaseAdmin.auth.admin.listUsers()

    if (fetchError) {
        console.error('[Mock SSO] Failed to fetch users:', fetchError)
        return null
    }

    const existingUser = existingUsers.users.find((u: any) => u.email === mockResponse.email)

    if (existingUser) {
        // User exists - try to sign in with testtest password
        console.log('[Mock SSO] Existing user found:', existingUser.id)

        const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
            email: mockResponse.email,
            password: 'testtest',
        })

        if (signInError || !signInData?.session) {
            console.error('[Mock SSO] Failed to sign in existing user:', signInError)
            console.error('[Mock SSO] Note: Existing users must have password "testtest" for mock SSO')
            return null
        }

        console.log('[Mock SSO] Existing user authenticated successfully')
        return {
            accessToken: signInData.session.access_token,
            refreshToken: signInData.session.refresh_token,
        }
    }

    // User doesn't exist - create them using admin API (bypasses triggers)
    console.log('[Mock SSO] Creating new user with admin.createUser')
    const defaultPassword = 'testtest' // Use known password for testing

    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: mockResponse.email,
        password: defaultPassword,
        email_confirm: true, // Auto-confirm email for SSO users
        user_metadata: {
            first_name: mockResponse.firstName || mockResponse.email.split('@')[0],
            last_name: mockResponse.lastName || '',
            sso_provider: mockResponse.providerId,
            sso_provider_id: mockResponse.providerId,
        },
    })

    if (createError || !createData.user) {
        console.error('[Mock SSO] Failed to create user via admin API:', createError)
        return null
    }

    console.log('[Mock SSO] New user created via admin API:', createData.user.id)

    if (mockResponse.orgId) {
        console.log('[Mock SSO] Adding user to org:', mockResponse.orgId)
        const { error: orgError } = await supabaseAdmin
            .from('org_users')
            .insert({
                org_id: mockResponse.orgId,
                user_id: createData.user.id,
                user_right: 'read',
            })

        if (orgError) {
            console.error('[Mock SSO] Failed to add user to org:', orgError)
        } else {
            console.log('[Mock SSO] User added to org successfully')
        }
    } else {
        console.error('[Mock SSO] Missing orgId while assigning user to org')
    }

    // Sign in with the password we just set
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: mockResponse.email,
        password: defaultPassword,
    })

    if (signInError || !signInData?.session) {
        console.error('[Mock SSO] Failed to sign in new user:', signInError)
        return null
    }

    console.log('[Mock SSO] New user authenticated successfully')
    return {
        accessToken: signInData.session.access_token,
        refreshToken: signInData.session.refresh_token,
    }
}

Deno.serve(async (req) => {
    // Only allow GET requests (simulating redirect from IdP)
    if (req.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })

    // Get email from query params (in real SAML, this comes from SAML assertion)
    const email = getMockEmail(req)
    if (!email) {
        return new Response(
            renderErrorPage('Missing email parameter. Add ?email=user@domain.com to the URL'),
            {
                status: 400,
                headers: { 'Content-Type': 'text/html' },
            },
        )
    }

    // Get redirect URL from RelayState
    const relayState = getRelayState(req)

    // Validate SSO provider
    const ssoConfig = await validateSSOProvider(supabaseAdmin, email)
    if (!ssoConfig) {
        return new Response(
            renderErrorPage(`SSO is not configured for domain: ${email.split('@')[1]}`),
            {
                status: 400,
                headers: { 'Content-Type': 'text/html' },
            },
        )
    }

    // Mock SAML response data
    const mockSAMLResponse: MockSAMLResponse = {
        email,
        firstName: email.split('@')[0],
        lastName: 'User',
        providerId: ssoConfig.providerId,
        orgId: ssoConfig.orgId,
    }

    // Authenticate user
    const tokens = await authenticateUser(supabaseAdmin, mockSAMLResponse)
    if (!tokens) {
        return new Response(
            renderErrorPage('Failed to authenticate user'),
            {
                status: 500,
                headers: { 'Content-Type': 'text/html' },
            },
        )
    }

    // Redirect to /login with tokens as query params (matching the invitation flow)
    // Use localhost:5173 for local frontend, not the edge runtime container origin
    const frontendUrl = 'http://localhost:5173'
    const redirectUrl = `${frontendUrl}/login?access_token=${tokens.accessToken}&refresh_token=${tokens.refreshToken}&to=${encodeURIComponent(relayState)}&from_sso=true`

    return new Response(
        renderSuccessPage(email, redirectUrl),
        {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
        },
    )
})

// Render success page with auto-redirect
function renderSuccessPage(email: string, redirectUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>SSO Login Success</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
    }
    .success-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      background: #10B981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      color: white;
    }
    h1 {
      color: #1F2937;
      margin: 0 0 10px;
      font-size: 24px;
    }
    p {
      color: #6B7280;
      margin: 10px 0;
    }
    .email {
      color: #119eff;
      font-weight: 600;
    }
    .loader {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #119eff;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
  <meta http-equiv="refresh" content="2;url=${redirectUrl}">
</head>
<body>
  <div class="container">
    <div class="success-icon">✓</div>
    <h1>SSO Login Successful!</h1>
    <p>Welcome, <span class="email">${email}</span></p>
    <p>Redirecting you to the application...</p>
    <div class="loader"></div>
    <p style="font-size: 12px; margin-top: 20px;">
      <strong>Mock SSO Mode</strong><br>
      This simulates Okta SAML authentication for local development.
    </p>
  </div>
  <script>
    // Auto-redirect after 2 seconds
    setTimeout(() => {
      window.location.href = '${redirectUrl}';
    }, 2000);
  </script>
</body>
</html>
  `
}

// Render error page
function renderErrorPage(message: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>SSO Error</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
    }
    .error-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      background: #EF4444;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      color: white;
    }
    h1 {
      color: #1F2937;
      margin: 0 0 10px;
      font-size: 24px;
    }
    p {
      color: #6B7280;
      margin: 10px 0;
    }
    .back-link {
      display: inline-block;
      margin-top: 20px;
      padding: 10px 20px;
      background: #119eff;
      color: white;
      text-decoration: none;
      border-radius: 5px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">✕</div>
    <h1>SSO Error</h1>
    <p>${message}</p>
    <a href="/sso-login" class="back-link">← Back to SSO Login</a>
  </div>
</body>
</html>
  `
}
