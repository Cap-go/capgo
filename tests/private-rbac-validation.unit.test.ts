import type { StandardSchemaV1 } from '@standard-schema/spec'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  addGroupMemberBodyHook,
  addGroupMemberBodySchema,
  createGroupBodyHook,
  createGroupBodySchema,
  createRoleBindingBodyHook,
  createRoleBindingBodySchema,
  invalidOrgIdHook,
  orgIdParamSchema,
  updateGroupBodyHook,
  updateGroupBodySchema,
  updateRoleBindingBodyHook,
  updateRoleBindingBodySchema,
  validateJsonBody,
} from '../supabase/functions/_backend/private/rbac_validation.ts'

type ValidationIssues = readonly StandardSchemaV1.Issue[]

interface StandardSchema {
  '~standard': {
    validate: (value: unknown) => StandardSchemaV1.Result<unknown> | Promise<StandardSchemaV1.Result<unknown>>
  }
}

async function getIssues(schema: StandardSchema, value: unknown): Promise<ValidationIssues> {
  const result = await Promise.resolve(schema['~standard'].validate(value))
  return result.issues ?? []
}

async function getErrorMessage(
  hook: (result: { success: false, error: ValidationIssues }, c: any) => Response | void,
  issues: ValidationIssues,
) {
  const response = hook(
    { success: false, error: issues },
    {
      json: (body: unknown, status: number) => new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    },
  )

  expect(response).toBeInstanceOf(Response)
  expect(response!.status).toBe(400)
  const payload = await response!.json() as { error: string }
  return payload.error
}

describe('rBAC validation hooks', () => {
  it.concurrent('maps invalid org params to the legacy error message', async () => {
    const issues = await getIssues(orgIdParamSchema, { org_id: 'not-a-uuid' })
    const error = await getErrorMessage(invalidOrgIdHook, issues)
    expect(error).toBe('Invalid org_id')
  })

  it.concurrent('keeps the create-group missing name error', async () => {
    const issues = await getIssues(createGroupBodySchema, {})
    const error = await getErrorMessage(createGroupBodyHook, issues)
    expect(error).toBe('Name is required')
  })

  it.concurrent('keeps the create-group empty name error', async () => {
    const issues = await getIssues(createGroupBodySchema, { name: '' })
    const error = await getErrorMessage(createGroupBodyHook, issues)
    expect(error).toBe('Name is required')
  })

  it.concurrent('keeps the update-group invalid description error', async () => {
    const issues = await getIssues(updateGroupBodySchema, { description: 42 })
    const error = await getErrorMessage(updateGroupBodyHook, issues)
    expect(error).toBe('Invalid description')
  })

  it.concurrent('parses headerless JSON bodies for update validation', async () => {
    const app = new Hono()

    app.put('/groups/:group_id', async (c) => {
      const result = await validateJsonBody(c, updateGroupBodySchema, updateGroupBodyHook)
      if (!result.ok) {
        return result.response
      }

      return c.json(result.data)
    })

    const response = await app.request(new Request('http://localhost/groups/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Renamed group' }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name: 'Renamed group' })
  })

  it.concurrent('rejects empty headerless JSON bodies with the legacy parse error', async () => {
    const app = new Hono()

    app.put('/groups/:group_id', async (c) => {
      const result = await validateJsonBody(c, updateGroupBodySchema, updateGroupBodyHook)
      if (!result.ok) {
        return result.response
      }

      return c.json(result.data)
    })

    const response = await app.request(new Request('http://localhost/groups/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PUT',
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'invalid_json_parse_body',
      message: 'Invalid JSON body',
    })
  })

  it.concurrent('keeps the add-group-member invalid user error', async () => {
    const issues = await getIssues(addGroupMemberBodySchema, { user_id: 'bad-user-id' })
    const error = await getErrorMessage(addGroupMemberBodyHook, issues)
    expect(error).toBe('Invalid user_id')
  })

  it.concurrent('keeps the role-binding missing required fields error', async () => {
    const issues = await getIssues(createRoleBindingBodySchema, {})
    const error = await getErrorMessage(createRoleBindingBodyHook, issues)
    expect(error).toBe('Missing required fields')
  })

  it.concurrent('keeps the role-binding empty role name create error', async () => {
    const issues = await getIssues(createRoleBindingBodySchema, {
      principal_type: 'user',
      principal_id: '550e8400-e29b-41d4-a716-446655440001',
      role_name: '',
      scope_type: 'org',
      org_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    const error = await getErrorMessage(createRoleBindingBodyHook, issues)
    expect(error).toBe('Missing required fields')
  })

  it.concurrent('keeps the role-binding invalid principal type error', async () => {
    const issues = await getIssues(createRoleBindingBodySchema, {
      principal_type: 'device',
      principal_id: '550e8400-e29b-41d4-a716-446655440001',
      role_name: 'org_admin',
      scope_type: 'org',
      org_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    const error = await getErrorMessage(createRoleBindingBodyHook, issues)
    expect(error).toBe('Invalid principal_type')
  })

  it.concurrent('keeps the role-binding update missing role name error', async () => {
    const issues = await getIssues(updateRoleBindingBodySchema, {})
    const error = await getErrorMessage(updateRoleBindingBodyHook, issues)
    expect(error).toBe('role_name is required')
  })

  it.concurrent('keeps the role-binding update empty role name error', async () => {
    const issues = await getIssues(updateRoleBindingBodySchema, { role_name: '' })
    const error = await getErrorMessage(updateRoleBindingBodyHook, issues)
    expect(error).toBe('role_name is required')
  })
})
