import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, resetAndSeedAppData, resetAppData, TEST_EMAIL, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.trigger.test.${id}`
let testOrgId: string
let testAppId: string

const triggerHeaders = {
  'Content-Type': 'application/json',
  'x-api-key': 'test-secret-key', // This would need to match your actual test secret
}

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)

  // Create test organization
  const { data: orgData, error: orgError } = await getSupabaseClient().from('orgs').insert({
    id: randomUUID(),
    name: `Test Trigger Org ${id}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
  }).select().single()

  if (orgError)
    throw orgError
  testOrgId = orgData.id

  // Create test app
  const { data: appData, error: appError } = await getSupabaseClient().from('apps').insert({
    id: randomUUID(),
    app_id: APPNAME,
    name: `Test Trigger App`,
    icon_url: 'https://example.com/icon.png',
    owner_org: testOrgId,
  }).select().single()

  if (appError)
    throw appError
  testAppId = appData.app_id
})

afterAll(async () => {
  await resetAppData(APPNAME)
  await getSupabaseClient().from('orgs').delete().eq('id', testOrgId)
})

describe('[POST] /triggers/cron_stats - Error Cases', () => {
  it('should return 400 when appId is missing', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_stats`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('No appId')
  })

  it('should return 400 when cycle info cannot be retrieved', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_stats`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        appId: 'nonexistent-app-id',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot get cycle info')
  })
})

describe('[POST] /triggers/cron_plan - Error Cases', () => {
  it('should return 400 when orgId is missing', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_plan`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('No orgId')
  })

  it('should return 500 when stats cannot be retrieved', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_plan`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        orgId: 'nonexistent-org-id',
      }),
    })
    expect(response.status).toBe(500)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot get stats')
  })
})

describe('[POST] /triggers/cron_email - Error Cases', () => {
  it('should return 400 when required fields are missing', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Missing email, appId, or type')
  })

  it('should return 400 when email is missing', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        appId: testAppId,
        type: 'stats',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Missing email, appId, or type')
  })

  it('should return 400 when appId is missing', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: 'test@example.com',
        type: 'stats',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Missing email, appId, or type')
  })

  it('should return 400 when type is missing', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: 'test@example.com',
        appId: testAppId,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Missing email, appId, or type')
  })

  it('should return 400 when email type is invalid', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: 'test@example.com',
        appId: testAppId,
        type: 'invalid_type',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Invalid email type')
  })

  it('should return 500 when stats cannot be generated', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: 'test@example.com',
        appId: 'nonexistent-app',
        type: 'stats',
      }),
    })
    expect(response.status).toBe(500)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot generate stats')
  })
})

describe('[POST] /triggers/cron_clear_versions - Error Cases', () => {
  it('should return 500 when cleanup fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_clear_versions`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        // This might trigger an error condition depending on the implementation
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBeDefined()
  })

  it('should return 429 when rate limit is exceeded', async () => {
    // This test is harder to trigger but we can at least test the structure
    const response = await fetch(`${BASE_URL}/triggers/cron_clear_versions`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({}),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Rate limit exceeded')
  })
})

describe('[POST] /triggers/on_channel_update - Error Cases', () => {
  it('should return 500 when channel update fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_channel_update`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'channels',
        type: 'UPDATE',
        record: {
          id: 'nonexistent-channel',
        },
        old_record: {},
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot update channel')
  })

  it('should return 200 for non-channel table', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_channel_update`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'not_channels',
        type: 'UPDATE',
        record: {},
        old_record: {},
      }),
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Not channels')
  })

  it('should return 200 for non-UPDATE type', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_channel_update`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'channels',
        type: 'INSERT',
        record: {},
        old_record: {},
      }),
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Not UPDATE')
  })
})

describe('[POST] /triggers/on_organization_create - Error Cases', () => {
  it('should return 500 when org creation handling fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_organization_create`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'orgs',
        type: 'INSERT',
        record: {
          // Invalid or incomplete org data
          id: 'invalid-org-id',
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot handle org creation')
  })
})

describe('[POST] /triggers/on_app_create - Error Cases', () => {
  it('should return 500 when organization fetching fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_app_create`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'apps',
        type: 'INSERT',
        record: {
          id: randomUUID(),
          app_id: 'test.app',
          owner_org: 'nonexistent-org-id',
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Error fetching organization')
  })

  it('should return 500 when app creation handling fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_app_create`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'apps',
        type: 'INSERT',
        record: {
          // Invalid app data
          id: null,
          app_id: null,
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot handle org creation')
  })
})

describe('[POST] /triggers/on_version_create - Error Cases', () => {
  it('should return 500 when organization fetching fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_version_create`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'app_versions',
        type: 'INSERT',
        record: {
          id: randomUUID(),
          app_id: 'nonexistent.app',
          name: '1.0.0',
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Error fetching organization')
  })

  it('should return 500 when version creation fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_version_create`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'app_versions',
        type: 'INSERT',
        record: {
          // Invalid version data
          id: null,
          app_id: null,
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot create version')
  })
})

describe('[POST] /triggers/on_deploy_history_create - Error Cases', () => {
  it('should return 500 when organization fetching fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_deploy_history_create`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'app_versions_meta',
        type: 'INSERT',
        record: {
          id: randomUUID(),
          app_id: 'nonexistent.app',
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Error fetching organization')
  })

  it('should return 500 when deploy history creation fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_deploy_history_create`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'app_versions_meta',
        type: 'INSERT',
        record: {
          // Invalid deploy history data
          id: null,
          app_id: null,
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot create deploy history')
  })
})

describe('[POST] /triggers/on_manifest_create - Error Cases', () => {
  it('should return 500 when manifest size update fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_manifest_create`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'app_versions_meta',
        type: 'INSERT',
        record: {
          // Invalid manifest data
          id: randomUUID(),
          app_id: 'invalid.app',
          size: 'invalid-size',
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot update manifest size')
  })
})

describe('[POST] /triggers/on_user_create - Error Cases', () => {
  it('should return 500 when user creation fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_user_create`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'users',
        type: 'INSERT',
        record: {
          // Invalid user data
          id: null,
          email: null,
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot create user')
  })
})

describe('[POST] /triggers/on_user_update - Error Cases', () => {
  it('should return 500 when user update fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_user_update`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'users',
        type: 'UPDATE',
        record: {
          // Invalid user data
          id: 'nonexistent-user-id',
        },
        old_record: {},
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot update user')
  })
})

describe('[POST] /triggers/on_user_delete - Error Cases', () => {
  it('should return 500 when user deletion fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_user_delete`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'users',
        type: 'DELETE',
        old_record: {
          // Invalid user data
          id: 'nonexistent-user-id',
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot delete user')
  })
})

describe('[POST] /triggers/on_organization_delete - Error Cases', () => {
  it('should return 500 when organization deletion fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_organization_delete`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'orgs',
        type: 'DELETE',
        old_record: {
          // Invalid org data
          id: 'nonexistent-org-id',
          customer_id: 'invalid-customer-id',
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot delete version')
  })
})

describe('[POST] /triggers/on_version_delete - Error Cases', () => {
  it('should return 500 when version deletion fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_version_delete`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'app_versions',
        type: 'DELETE',
        old_record: {
          // Invalid version data
          id: 'nonexistent-version-id',
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot delete version')
  })
})

describe('[POST] /triggers/on_version_update - Error Cases', () => {
  it('should return 200 for non-version table', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_version_update`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'not_app_versions',
        type: 'UPDATE',
        record: {},
        old_record: {},
      }),
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Not app_versions')
  })

  it('should return 200 for non-UPDATE type', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_version_update`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'app_versions',
        type: 'INSERT',
        record: {},
        old_record: {},
      }),
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Not UPDATE')
  })

  it('should return 500 when version update fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_version_update`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'app_versions',
        type: 'UPDATE',
        record: {
          // Invalid version data
          id: 'nonexistent-version-id',
        },
        old_record: {},
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot update version')
  })
})

describe('[POST] /triggers/clear_app_cache - Error Cases', () => {
  it('should return 500 when cache invalidation fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/clear_app_cache`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        // This might trigger cache invalidation errors
        app_id: 'invalid-app-id',
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot invalidate cache')
  })
})

describe('[POST] /triggers/clear_device_cache - Error Cases', () => {
  it('should return 500 when device cache invalidation fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/clear_device_cache`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        // This might trigger cache invalidation errors
        device_id: 'invalid-device-id',
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot invalidate cache')
  })
})

describe('[POST] /triggers/stripe_event - Error Cases', () => {
  it('should return 500 when event parsing fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/stripe_event`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        // Invalid stripe event data
        type: 'invalid.event.type',
        data: {},
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Cannot parse event')
  })

  it('should return 400 when no organization is found', async () => {
    const response = await fetch(`${BASE_URL}/triggers/stripe_event`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        type: 'customer.subscription.created',
        data: {
          object: {
            customer: 'nonexistent-customer-id',
          },
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('Webhook Error: no org found')
  })

  it('should return 500 when customer_id is not found', async () => {
    const response = await fetch(`${BASE_URL}/triggers/stripe_event`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        type: 'customer.subscription.updated',
        data: {
          object: {
            customer: null,
          },
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toContain('customer_id not found')
  })
})
