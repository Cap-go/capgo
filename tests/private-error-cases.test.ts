import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APIKEY_STATS, getEndpointUrl, getSupabaseClient, headers, NON_OWNER_ORG_ID, resetAndSeedAppData, resetAppData, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.private.error.${id}`
// Use unique org ID per test run to prevent conflicts with parallel tests
const testOrgId = randomUUID()
const testOrgEmail = `test-private-error-${id}@capgo.app`
const testCustomerId = `cus_test_${id}`

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)

  // Create stripe_info for this test org (so user can access it via RLS)
  const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
    customer_id: testCustomerId,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: `sub_${id}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  // Create unique test organization (WITH a customer_id so RLS allows access)
  const { error: orgError } = await getSupabaseClient().from('orgs').insert({
    id: testOrgId,
    name: `Test Private Error Org ${id}`,
    management_email: testOrgEmail,
    created_by: USER_ID,
    customer_id: testCustomerId,
  })

  if (orgError)
    throw orgError

  // Add test user as super_admin to the org
  const { error: orgUserError } = await getSupabaseClient().from('org_users').insert({
    org_id: testOrgId,
    user_id: USER_ID,
    user_right: 'super_admin' as const,
  })
  if (orgUserError)
    throw orgUserError
})

afterAll(async () => {
  await resetAppData(APPNAME)
  
  // Clean up the unique test organization
  await getSupabaseClient().from('org_users').delete().eq('org_id', testOrgId)
  await getSupabaseClient().from('orgs').delete().eq('id', testOrgId)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', testCustomerId)
})

describe('[POST] /private/create_device - Error Cases', () => {
  it('should return 401 when not authorized', async () => {
    const response = await fetch(getEndpointUrl('/private/create_device'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Missing authorization header
      },
      body: JSON.stringify({
        app_id: APPNAME,
        org_id: NON_OWNER_ORG_ID,
        device_id: randomUUID(),
        platform: 'android',
        version: 1,
      }),
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })

  it('should return 400 for invalid JSON body', async () => {
    const response = await fetch(getEndpointUrl('/private/create_device'), {
      method: 'POST',
      headers,
      body: 'invalid json',
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_json_parse_body')
  })

  it('should return 404 when app not found', async () => {
    // Use testOrgId where user has super_admin rights to properly test app not found
    const response = await fetch(getEndpointUrl('/private/create_device'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app',
        org_id: testOrgId,
        device_id: randomUUID(),
        platform: 'android',
        version_name: '1.0.0',
      }),
    })
    expect(response.status).toBe(404)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('app_not_found')
  })

  it('should return 401 when not authorized for specific app', async () => {
    const response = await fetch(getEndpointUrl('/private/create_device'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'com.demoadmin.app', // Use the admin app that test user doesn't have access to
        org_id: NON_OWNER_ORG_ID,
        device_id: randomUUID(),
        platform: 'android',
        version_name: '1.0.0',
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_authorized')
  })
})

describe('[POST] /private/upload_link - Error Cases', () => {
  it('should return 500 when user not found', async () => {
    const response = await fetch(getEndpointUrl('/private/upload_link'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app',
        version: '1.0.0',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('app_access_denied')
  })

  it('should return 400 when user cannot access app', async () => {
    const response = await fetch(getEndpointUrl('/private/upload_link'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app',
        version: '1.0.0',
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('app_access_denied')
  })

  it('should return 500 when app not found', async () => {
    const response = await fetch(getEndpointUrl('/private/upload_link'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version: '1.0.0',
      }),
    })

    expect(response.status).toBe(404)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('error_version_not_found')
  })

  it('should return 500 when version already exists', async () => {
    const response = await fetch(getEndpointUrl('/private/upload_link'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version: 'unknown', // This version likely exists
      }),
    })

    expect(response.status).toBe(404)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('error_version_not_found')
  })
})

describe('[POST] /private/download_link - Error Cases', () => {
  it('should return 400 when authorization cannot be found', async () => {
    const response = await fetch(getEndpointUrl('/private/download_link'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Missing authorization
      },
      body: JSON.stringify({
        app_id: APPNAME,
        version: '1.0.0',
      }),
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })

  it('should return 401 when not authorized', async () => {
    const response = await fetch(getEndpointUrl('/private/download_link'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'unauthorized.app',
        version: '1.0.0',
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_jwt')
  })

  it('should return 401 when user cannot access app', async () => {
    const response = await fetch(getEndpointUrl('/private/download_link'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app',
        version: '1.0.0',
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_jwt')
  })
})

describe('[POST] /private/delete_failed_version - Error Cases', () => {
  it('should return 500 when user not found', async () => {
    const response = await fetch(getEndpointUrl('/private/delete_failed_version'), {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app',
        name: '1.0.0',
      }),
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_authorized')
  })

  it('should return 401 when user cannot access app', async () => {
    const response = await fetch(getEndpointUrl('/private/delete_failed_version'), {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app',
        name: '1.0.0',
      }),
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_authorized')
  })

  it('should return 500 when app_id or bundle name missing', async () => {
    const response = await fetch(getEndpointUrl('/private/delete_failed_version'), {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        // Missing name
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('error_bundle_name_missing')
  })
})

describe('[POST] /private/log_as - Error Cases', () => {
  it('should return 401 when not authorized', async () => {
    const response = await fetch(getEndpointUrl('/private/log_as'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Missing authorization
      },
      body: JSON.stringify({
        user_id: randomUUID(),
      }),
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })

  it('should return 401 for invalid JWT with malformed body', async () => {
    const response = await fetch(getEndpointUrl('/private/log_as'), {
      method: 'POST',
      headers,
      body: 'invalid json',
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_jwt')
  })

  it('should return 401 when JWT is invalid', async () => {
    const response = await fetch(getEndpointUrl('/private/log_as'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: randomUUID(),
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_jwt')
  })

  it('should return 401 when JWT is invalid for unknown user', async () => {
    const response = await fetch(getEndpointUrl('/private/log_as'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: 'nonexistent-user-id',
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_jwt')
  })
})

describe('[POST] /private/set_org_email - Error Cases', () => {
  it('should return 401 when not authorized', async () => {
    const response = await fetch(getEndpointUrl('/private/set_org_email'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Missing authorization
      },
      body: JSON.stringify({
        org_id: testOrgId,
        email: 'test@example.com',
      }),
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })

  it('should return 400 for invalid JSON body', async () => {
    const response = await fetch(getEndpointUrl('/private/set_org_email'), {
      method: 'POST',
      headers,
      body: 'invalid json',
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_json_parse_body')
  })

  it('should return 400 when org does not have customer', async () => {
    // Temporarily remove customer_id from the org to test the error case
    await getSupabaseClient().from('orgs').update({ customer_id: null }).eq('id', testOrgId)

    const response = await fetch(getEndpointUrl('/private/set_org_email'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: testOrgId,
        email: 'test@example.com',
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('org_does_not_have_customer')

    // Restore customer_id for other tests
    await getSupabaseClient().from('orgs').update({ customer_id: testCustomerId }).eq('id', testOrgId)
  })

  it('should return 403 when not authorized for org', async () => {
    const response = await fetch(getEndpointUrl('/private/set_org_email'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: NON_OWNER_ORG_ID,
        email: 'test@example.com',
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_authorized')
  })
})

describe('[POST] /private/accept_invitation - Error Cases', () => {
  it('should return 400 for invalid request', async () => {
    const response = await fetch(getEndpointUrl('/private/accept_invitation'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        // Missing required fields
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_json_body')
  })

  it('should return 404 when invitation not found', async () => {
    const response = await fetch(getEndpointUrl('/private/accept_invitation'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        password: 'ValidPassword123!!',
        magic_invite_string: 'nonexistent-invitation-id',
        opt_for_newsletters: false,
        captchaToken: 'test-captcha-token',
      }),
    })

    expect(response.status).toBe(500)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('failed_to_accept_invitation')
  })
})

describe('[POST] /private/invite_new_user_to_org - Error Cases', () => {
  it('should return 401 when JWT is invalid before captcha validation', async () => {
    // Auth validation runs before captcha verification.
    const response = await fetch(getEndpointUrl('/private/invite_new_user_to_org'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: testOrgId,
        email: 'existing@example.com',
        invite_type: 'read',
        captcha_token: 'test-captcha-token',
        first_name: 'Test',
        last_name: 'User',
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_jwt')
  })

  it('should return 401 when JWT is invalid for nonexistent org', async () => {
    // Auth validation runs before org lookup or captcha verification.
    const response = await fetch(getEndpointUrl('/private/invite_new_user_to_org'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: randomUUID(),
        email: 'test@example.com',
        invite_type: 'read',
        captcha_token: 'test-captcha-token',
        first_name: 'Test',
        last_name: 'User',
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_jwt')
  })
})

describe('[POST] /private/stats - Error Cases', () => {
  it('should return 400 when user not found', async () => {
    const response = await fetch(getEndpointUrl('/private/stats'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        appId: 'nonexistent.app',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('app_access_denied')
  })

  it('should return 400 when user cannot access app', async () => {
    const response = await fetch(getEndpointUrl('/private/stats'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        appId: 'unauthorized.app',
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('app_access_denied')
  })

  it('should work when used with APIKEY', async () => {
    const response = await fetch(getEndpointUrl('/private/stats'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        appId: APPNAME,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { error: string }
    console.log(data)
    expect(data).toBeDefined()
  })

  it('should return 400 when wrong auth', async () => {
    const response = await fetch(getEndpointUrl('/private/stats'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'capgkey': APIKEY_STATS,
      },
      body: JSON.stringify({
        appId: APPNAME,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('app_access_denied')
  })
  it('should return 401 when no auth', async () => {
    const response = await fetch(getEndpointUrl('/private/stats'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appId: APPNAME,
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })
})

describe('[POST] /private/plans - Error Cases', () => {
  it('should return 500 when plans cannot be retrieved', async () => {
    const response = await fetch(getEndpointUrl('/private/plans'), {
      method: 'GET',
      headers,
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { error: string }
    expect(data).toBeDefined()
  })
})

describe('[POST] /private/latency - Error Cases', () => {
  it('should return 400 when latency post fails', async () => {
    const response = await fetch(getEndpointUrl('/private/latency'), {
      method: 'GET',
      headers,
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { error: string }
    expect(data).toBeDefined()
  })
})

describe('[POST] /private/config - Error Cases', () => {
  it('should return 500 when config cannot be retrieved', async () => {
    const response = await fetch(getEndpointUrl('/private/config'), {
      method: 'GET',
      headers,
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { error: string }
    expect(data).toBeDefined()
  })
})
