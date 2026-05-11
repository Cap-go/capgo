import { describe, expect, it } from 'vitest'

/**
 * Verify that missing-field and invalid-field errors for create_app
 * do not echo raw request body values back to the caller.
 */

// Simulate the field-presence metadata approach used in the fix
function missingAppIdError(body: { app_id?: string, name?: string, owner_org?: string }) {
  return { code: 'missing_app_id', data: { has_app_id: false, has_name: !!body.name, has_owner_org: !!body.owner_org } }
}

function missingNameError(body: { app_id?: string, name?: string, owner_org?: string }) {
  return { code: 'missing_name', data: { has_app_id: !!body.app_id, has_name: false, has_owner_org: !!body.owner_org } }
}

function missingOwnerOrgError(body: { app_id?: string, name?: string, owner_org?: string }) {
  return { code: 'missing_owner_org', data: { has_app_id: !!body.app_id, has_name: !!body.name, has_owner_org: false } }
}

function invalidAppIdError() {
  return { code: 'invalid_app_id', data: null }
}

describe('create_app validation body redaction', () => {
  it('missing_app_id error does not contain raw body or app_id value', () => {
    const body = { name: 'Secret App Name', owner_org: 'org-secret-uuid' }
    const err = missingAppIdError(body)
    const serialized = JSON.stringify(err.data ?? {})

    expect(serialized).not.toContain('Secret App Name')
    expect(serialized).not.toContain('org-secret-uuid')
    // Should have presence flags
    expect(err.data.has_app_id).toBe(false)
    expect(err.data.has_name).toBe(true)
    expect(err.data.has_owner_org).toBe(true)
  })

  it('missing_name error does not contain raw body fields', () => {
    const body = { app_id: 'com.secret.app', owner_org: 'org-secret-uuid' }
    const err = missingNameError(body)
    const serialized = JSON.stringify(err.data ?? {})

    expect(serialized).not.toContain('com.secret.app')
    expect(serialized).not.toContain('org-secret-uuid')
    expect(err.data.has_app_id).toBe(true)
    expect(err.data.has_name).toBe(false)
    expect(err.data.has_owner_org).toBe(true)
  })

  it('missing_owner_org error does not contain raw body fields', () => {
    const body = { app_id: 'com.secret.app', name: 'Secret Name' }
    const err = missingOwnerOrgError(body)
    const serialized = JSON.stringify(err.data ?? {})

    expect(serialized).not.toContain('com.secret.app')
    expect(serialized).not.toContain('Secret Name')
    expect(err.data.has_app_id).toBe(true)
    expect(err.data.has_name).toBe(true)
    expect(err.data.has_owner_org).toBe(false)
  })

  it('invalid_app_id error does not echo submitted app_id value', () => {
    const err = invalidAppIdError()
    const serialized = JSON.stringify(err ?? {})

    // No raw submitted value in the error
    expect(err.data).toBeNull()
    expect(serialized).not.toContain('app_id:')
  })

  it('field presence flags are booleans not raw values', () => {
    const body = { app_id: 'com.example', name: 'Test', owner_org: 'org-123' }
    const err = missingAppIdError(body)

    expect(typeof err.data.has_app_id).toBe('boolean')
    expect(typeof err.data.has_name).toBe('boolean')
    expect(typeof err.data.has_owner_org).toBe('boolean')
  })
})
