import { describe, expect, it } from 'vitest'
import { parseCreateDeviceBody } from '../supabase/functions/_backend/private/create_device.ts'

function getThrownCause(action: () => void) {
  try {
    action()
  }
  catch (error) {
    const thrown = error as Error & { cause?: any, status?: number }
    return {
      status: thrown.status,
      cause: thrown.cause,
    }
  }

  throw new Error('Expected action to throw')
}

describe('create_device error redaction', () => {
  it('does not expose request bodies in schema validation errors', () => {
    const rawBody = {
      app_id: 'com.secret.app',
      org_id: 'not-a-uuid',
      device_id: 'also-not-a-uuid',
      platform: 'windows',
      version_name: '1.2.3-secret',
      token: 'super-secret-token',
    }

    const { status, cause } = getThrownCause(() => parseCreateDeviceBody(rawBody))
    const serialized = JSON.stringify(cause)

    expect(status).toBe(400)
    expect(cause).toMatchObject({
      error: 'invalid_json_body',
      message: 'Invalid JSON body',
      moreInfo: {},
    })
    expect(serialized).not.toMatch(/com\.secret\.app|not-a-uuid|also-not-a-uuid|windows|1\.2\.3-secret|super-secret-token/)
  })
})
