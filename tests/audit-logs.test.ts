import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { BASE_URL, getSupabaseClient, headers, TEST_EMAIL, USER_ID } from './test-utils.ts'

const ORG_ID = randomUUID()
const globalId = randomUUID()
const name = `Test Audit Organization ${globalId}`
const customerId = `cus_audit_${ORG_ID}`

// Schema for audit log response
const auditLogSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  table_name: z.string(),
  record_id: z.string(),
  operation: z.string(),
  user_id: z.nullable(z.string()),
  org_id: z.string(),
  old_record: z.unknown(),
  new_record: z.unknown(),
  changed_fields: z.nullable(z.array(z.string())),
})

const auditLogsResponseSchema = z.object({
  data: z.array(auditLogSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

beforeAll(async () => {
  // Create stripe_info for this test org
  const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
    customer_id: customerId,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: `sub_${globalId}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  // Create test organization (this should trigger an INSERT audit log via the trigger)
  const { error } = await getSupabaseClient().from('orgs').insert({
    id: ORG_ID,
    name,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: customerId,
  })
  if (error)
    throw error
})

afterAll(async () => {
  // Clean up: delete audit logs first (they reference the org)
  await getSupabaseClient().from('audit_logs').delete().eq('org_id', ORG_ID)

  // Clean up test organization and stripe_info
  await getSupabaseClient().from('orgs').delete().eq('id', ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
})

describe('[GET] /organization/audit', () => {
  it('get audit logs for organization', async () => {
    const response = await fetch(`${BASE_URL}/organization/audit?orgId=${ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseData = await response.json()
    const safe = auditLogsResponseSchema.safeParse(responseData)
    expect(safe.success).toBe(true)
    if (safe.success) {
      expect(safe.data.page).toBe(0)
      expect(safe.data.limit).toBe(50)
      expect(Array.isArray(safe.data.data)).toBe(true)
    }
  })

  it('get audit logs with pagination', async () => {
    const response = await fetch(`${BASE_URL}/organization/audit?orgId=${ORG_ID}&page=0&limit=10`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseData = await response.json()
    const safe = auditLogsResponseSchema.safeParse(responseData)
    expect(safe.success).toBe(true)
    if (safe.success) {
      expect(safe.data.page).toBe(0)
      expect(safe.data.limit).toBe(10)
    }
  })

  it('get audit logs filtered by table name', async () => {
    const response = await fetch(`${BASE_URL}/organization/audit?orgId=${ORG_ID}&tableName=orgs`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseData = await response.json()
    const safe = auditLogsResponseSchema.safeParse(responseData)
    expect(safe.success).toBe(true)
    if (safe.success) {
      // All returned logs should be for the 'orgs' table
      for (const log of safe.data.data) {
        expect(log.table_name).toBe('orgs')
      }
    }
  })

  it('get audit logs filtered by operation', async () => {
    const response = await fetch(`${BASE_URL}/organization/audit?orgId=${ORG_ID}&operation=INSERT`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseData = await response.json()
    const safe = auditLogsResponseSchema.safeParse(responseData)
    expect(safe.success).toBe(true)
    if (safe.success) {
      // All returned logs should be INSERT operations
      for (const log of safe.data.data) {
        expect(log.operation).toBe('INSERT')
      }
    }
  })

  it('get audit logs with combined filters', async () => {
    const response = await fetch(`${BASE_URL}/organization/audit?orgId=${ORG_ID}&tableName=orgs&operation=INSERT`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseData = await response.json()
    const safe = auditLogsResponseSchema.safeParse(responseData)
    expect(safe.success).toBe(true)
    if (safe.success) {
      for (const log of safe.data.data) {
        expect(log.table_name).toBe('orgs')
        expect(log.operation).toBe('INSERT')
      }
    }
  })

  it('limit is capped at 100', async () => {
    const response = await fetch(`${BASE_URL}/organization/audit?orgId=${ORG_ID}&limit=200`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseData = await response.json()
    const safe = auditLogsResponseSchema.safeParse(responseData)
    expect(safe.success).toBe(true)
    if (safe.success) {
      // Server should cap limit at 100
      expect(safe.data.limit).toBe(100)
    }
  })

  it('get audit logs with missing orgId returns error', async () => {
    const response = await fetch(`${BASE_URL}/organization/audit`, {
      headers,
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it('get audit logs with invalid orgId returns error', async () => {
    const invalidOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/organization/audit?orgId=${invalidOrgId}`, {
      headers,
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_org_id')
  })
})

describe('Audit log triggers', () => {
  it('organization UPDATE creates audit log with changed_fields', async () => {
    const newName = `Updated Audit Organization ${randomUUID()}`

    // Update the organization
    const { error: updateError } = await getSupabaseClient()
      .from('orgs')
      .update({ name: newName })
      .eq('id', ORG_ID)
    expect(updateError).toBeNull()

    // Wait a bit for the trigger to execute
    await new Promise(resolve => setTimeout(resolve, 100))

    // Fetch audit logs for this org
    const response = await fetch(`${BASE_URL}/organization/audit?orgId=${ORG_ID}&tableName=orgs&operation=UPDATE`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseData = await response.json()
    const safe = auditLogsResponseSchema.safeParse(responseData)
    expect(safe.success).toBe(true)

    if (safe.success && safe.data.data.length > 0) {
      const latestUpdate = safe.data.data[0]
      expect(latestUpdate.operation).toBe('UPDATE')
      expect(latestUpdate.table_name).toBe('orgs')
      expect(latestUpdate.record_id).toBe(ORG_ID)
      expect(latestUpdate.org_id).toBe(ORG_ID)
      // Changed fields should include 'name' and 'updated_at'
      expect(Array.isArray(latestUpdate.changed_fields)).toBe(true)
      expect(latestUpdate.changed_fields).toContain('name')
      // old_record should have the old name
      expect(latestUpdate.old_record).toBeTruthy()
      // new_record should have the new name
      expect(latestUpdate.new_record).toBeTruthy()
      if (latestUpdate.new_record && typeof latestUpdate.new_record === 'object') {
        expect((latestUpdate.new_record as Record<string, unknown>).name).toBe(newName)
      }
    }
  })

  it('org_users INSERT creates audit log', async () => {
    // Get another user to add to the org
    const { data: anotherUser, error: userError } = await getSupabaseClient()
      .from('users')
      .select('id')
      .neq('id', USER_ID)
      .limit(1)
      .single()

    expect(userError).toBeNull()
    expect(anotherUser).toBeTruthy()

    if (!anotherUser) {
      console.warn('Skipping test: Could not find another user')
      return
    }

    // Add user to org
    const { error: insertError } = await getSupabaseClient()
      .from('org_users')
      .insert({
        org_id: ORG_ID,
        user_id: anotherUser.id,
        user_right: 'read',
      })
    expect(insertError).toBeNull()

    // Wait a bit for the trigger to execute
    await new Promise(resolve => setTimeout(resolve, 100))

    // Fetch audit logs
    const response = await fetch(`${BASE_URL}/organization/audit?orgId=${ORG_ID}&tableName=org_users&operation=INSERT`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseData = await response.json()
    const safe = auditLogsResponseSchema.safeParse(responseData)
    expect(safe.success).toBe(true)

    if (safe.success && safe.data.data.length > 0) {
      const latestInsert = safe.data.data[0]
      expect(latestInsert.operation).toBe('INSERT')
      expect(latestInsert.table_name).toBe('org_users')
      expect(latestInsert.org_id).toBe(ORG_ID)
      expect(latestInsert.old_record).toBeNull() // INSERT has no old record
      expect(latestInsert.new_record).toBeTruthy()
    }

    // Clean up: delete the org_user
    await getSupabaseClient()
      .from('org_users')
      .delete()
      .eq('org_id', ORG_ID)
      .eq('user_id', anotherUser.id)
  })

  it('org_users DELETE creates audit log', async () => {
    // Get another user to add and then remove
    const { data: anotherUser, error: userError } = await getSupabaseClient()
      .from('users')
      .select('id')
      .neq('id', USER_ID)
      .limit(1)
      .single()

    expect(userError).toBeNull()
    expect(anotherUser).toBeTruthy()

    if (!anotherUser) {
      console.warn('Skipping test: Could not find another user')
      return
    }

    // Add user to org
    const { error: insertError } = await getSupabaseClient()
      .from('org_users')
      .insert({
        org_id: ORG_ID,
        user_id: anotherUser.id,
        user_right: 'read',
      })
    expect(insertError).toBeNull()

    // Wait for insert trigger
    await new Promise(resolve => setTimeout(resolve, 100))

    // Delete the org_user
    const { error: deleteError } = await getSupabaseClient()
      .from('org_users')
      .delete()
      .eq('org_id', ORG_ID)
      .eq('user_id', anotherUser.id)
    expect(deleteError).toBeNull()

    // Wait for delete trigger
    await new Promise(resolve => setTimeout(resolve, 100))

    // Fetch audit logs for DELETE
    const response = await fetch(`${BASE_URL}/organization/audit?orgId=${ORG_ID}&tableName=org_users&operation=DELETE`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseData = await response.json()
    const safe = auditLogsResponseSchema.safeParse(responseData)
    expect(safe.success).toBe(true)

    if (safe.success && safe.data.data.length > 0) {
      const latestDelete = safe.data.data[0]
      expect(latestDelete.operation).toBe('DELETE')
      expect(latestDelete.table_name).toBe('org_users')
      expect(latestDelete.org_id).toBe(ORG_ID)
      expect(latestDelete.new_record).toBeNull() // DELETE has no new record
      expect(latestDelete.old_record).toBeTruthy()
    }
  })
})
