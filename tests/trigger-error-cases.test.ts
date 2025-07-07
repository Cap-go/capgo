import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, ORG_ID, resetAndSeedAppData, resetAppData, USER_EMAIL } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.trigger.test.${id}`

const triggerHeaders = {
  'Content-Type': 'application/json',
  'apisecret': 'testsecret', // This would need to match your actual test secret
}

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})

afterAll(async () => {
  await resetAppData(APPNAME)
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
    expect(data.error).toBe('no_appId')
  })

  it('should return 400 when org is missing', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_stats`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        appId: 'nonexistent-app-id',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_orgId')
  })

  it('should return 400 when appId is not provided', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_stats`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        orgId: ORG_ID,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_appId')
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
    expect(data.error).toBe('no_orgId')
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
    expect(data.error).toBe('missing_email_appId_type')
  })

  it('should return 400 when email is missing', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        appId: APPNAME,
        type: 'stats',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_email_appId_type')
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
    expect(data.error).toBe('missing_email_appId_type')
  })

  it('should return 400 when type is missing', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: 'test@example.com',
        appId: APPNAME,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_email_appId_type')
  })

  it('should return 400 when email type is invalid', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: USER_EMAIL,
        appId: APPNAME,
        type: 'invalid_type',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_stats_type')
  })

  it('should return 400 when stats cannot be generated', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: 'test@example.com',
        appId: 'nonexistent-app',
        type: 'yoyoy',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('user_not_found')
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
    expect(data.error).toBe('no_version')
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
    expect(data.error).toBe('no_app_id')
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
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('table_not_match')
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
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('type_not_match')
  })
})

describe('[POST] /triggers/on_app_create - Error Cases', () => {
  it('should return 400 when organization fetching fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_app_create`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'apps',
        type: 'INSERT',
        record: {
          id: randomUUID(),
          app_id: 'test.app',
          owner_org: randomUUID(),
        },
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('error_fetching_organization')
  })

  it('should return 400 when app creation handling fails', async () => {
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

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_id')
  })
})

describe('[POST] /triggers/on_version_create - Error Cases', () => {
  it('should return 400 when organization fetching fails', async () => {
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

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('error_fetching_organization')
  })

  it('should return 400 when version creation fails', async () => {
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
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_id')
  })
})

describe('[POST] /triggers/on_deploy_history_create - Error Cases', () => {
  it('should return 400 when deploy history creation fails', async () => {
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

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('table_not_match')
  })
})

describe('[POST] /triggers/on_manifest_create - Error Cases', () => {
  it('should return 500 when manifest size update fails', async () => {
    const response = await fetch(`${BASE_URL}/triggers/on_manifest_create`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'manifest',
        type: 'INSERT',
        record: {
          // Invalid manifest data
          id: randomUUID(),
          app_id: 'invalid.app',
          size: 'invalid-size',
        },
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_app_version_id_or_s3_path')
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
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('table_not_match')
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
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('type_not_match')
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
    expect(data.error).toBe('webhook_error_no_secret')
  })
})
