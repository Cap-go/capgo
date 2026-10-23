import type { QueryCatalog, QueryColumn, QueryForeignKey, QueryFunction } from '../supabase/functions/_backend/private/console_query_sql'
import { describe, expect, it } from 'vitest'
import { compileConsoleQuery, shapeConsoleQueryResult } from '../supabase/functions/_backend/private/console_query_sql'

function column(name: string, udt: string): QueryColumn {
  return { name, udt }
}

function key(name: string, sourceTable: string, sourceColumn: string, targetTable: string, targetColumn: string, unique = false): QueryForeignKey {
  return { name, sourceTable, sourceColumn, targetTable, targetColumn, unique }
}

function fn(name: string, argNames: string[], argTypes: string[], returnsSet = false, returnsComposite = false): QueryFunction {
  return { name, argNames, argTypes, returnsSet, returnsComposite }
}

const catalog: QueryCatalog = {
  columns: new Map([
    ['users', [column('id', 'uuid'), column('email', 'text'), column('onboarding', 'jsonb')]],
    ['orgs', [column('id', 'uuid'), column('name', 'text'), column('customer_id', 'text'), column('created_at', 'timestamptz')]],
    ['stripe_info', [column('customer_id', 'text'), column('paid_at', 'timestamptz'), column('trial_at', 'timestamptz')]],
    ['org_users', [column('user_id', 'uuid'), column('org_id', 'uuid')]],
    ['deploy_history', [column('id', 'int8'), column('app_id', 'text'), column('channel_id', 'int8'), column('version_id', 'int8'), column('created_at', 'timestamptz')]],
    ['app_versions', [column('id', 'int8'), column('name', 'text'), column('app_id', 'text'), column('created_at', 'timestamptz'), column('deleted', 'bool'), column('native_packages', 'jsonb')]],
    ['channels', [column('id', 'int8'), column('name', 'text'), column('app_id', 'text'), column('version', 'int8')]],
    ['audit_logs', [column('org_id', 'uuid'), column('operation', 'text'), column('table_name', 'text'), column('changed_fields', '_text'), column('old_record', 'jsonb'), column('created_at', 'timestamptz'), column('record_id', 'text')]],
    ['role_bindings', [column('principal_id', 'text'), column('role_id', 'uuid'), column('org_id', 'uuid')]],
    ['roles', [column('id', 'uuid'), column('name', 'text')]],
    ['apps', [column('id', 'uuid'), column('app_id', 'text'), column('owner_org', 'uuid'), column('created_by', 'uuid'), column('other_user', 'uuid')]],
    ['group_members', [column('group_id', 'uuid'), column('user_id', 'uuid')]],
  ]),
  foreignKeys: [
    key('orgs_customer_id_fkey', 'orgs', 'customer_id', 'stripe_info', 'customer_id'),
    key('org_users_user_id_fkey', 'org_users', 'user_id', 'users', 'id'),
    key('deploy_history_version_id_fkey', 'deploy_history', 'version_id', 'app_versions', 'id'),
    key('deploy_history_channel_id_fkey', 'deploy_history', 'channel_id', 'channels', 'id'),
    key('channels_version_fkey', 'channels', 'version', 'app_versions', 'id'),
    key('role_bindings_role_id_fkey', 'role_bindings', 'role_id', 'roles', 'id'),
    key('apps_owner_org_fkey', 'apps', 'owner_org', 'orgs', 'id'),
    key('apps_created_by_fkey', 'apps', 'created_by', 'users', 'id'),
    key('apps_other_user_fkey', 'apps', 'other_user', 'users', 'id'),
  ],
  functions: [
    fn('is_platform_admin', [], []),
    fn('is_platform_admin', ['userid'], ['uuid']),
    fn('is_not_deleted', ['email_check'], ['varchar']),
    fn('get_org_members', ['guild_id'], ['uuid'], true, true),
    fn('get_org_members', ['guild_id', 'user_id'], ['uuid', 'uuid'], true, true),
  ],
}

function flat(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function compile(request: Parameters<typeof compileConsoleQuery>[1]) {
  const compiled = compileConsoleQuery(catalog, request)
  return { ...compiled, text: flat(compiled.text) }
}

describe('console query sql', () => {
  it('compiles an equality filter and keeps the value out of the SQL text', () => {
    const compiled = compile({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'select', args: ['id, email'] }, { method: 'eq', args: ['id', 'user-1'] }, { method: 'single', args: [] }],
    })
    expect(compiled.text).toBe('SELECT jsonb_build_object(\'id\', t."id", \'email\', t."email") AS row FROM "public"."users" AS t WHERE t."id" = $1::uuid LIMIT 2')
    expect(compiled.values).toEqual(['user-1'])
    expect(compiled.text).not.toContain('user-1')
    expect(compiled.cardinality).toBe('one')
  })

  it('treats eq and neq null as null checks', () => {
    const missing = compile({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'select', args: ['*'] }, { method: 'eq', args: ['email', null] }],
    })
    expect(missing.text).toContain('WHERE t."email" IS NULL')
    const present = compile({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'not', args: ['email', 'is', null] }],
    })
    expect(present.text).toContain('WHERE NOT (t."email" IS NULL)')
  })

  it('compiles in, jsonb equality, and a json path as text', () => {
    const listed = compile({
      kind: 'table',
      name: 'role_bindings',
      args: [],
      operations: [{ method: 'select', args: ['principal_id'] }, { method: 'in', args: ['principal_id', ['a', 'b']] }],
    })
    expect(listed.text).toContain('t."principal_id" = ANY($1::text[])')
    expect(listed.values).toEqual([['a', 'b']])

    const onboarding = compile({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'filter', args: ['onboarding', 'eq', '{"step":1}'] }],
    })
    expect(onboarding.text).toContain('t."onboarding" = $1::jsonb')
    expect(onboarding.values).toEqual(['{"step":1}'])

    const path = compile({
      kind: 'table',
      name: 'audit_logs',
      args: [],
      operations: [{ method: 'eq', args: ['old_record->>version', '1.2.3'] }],
    })
    expect(path.text).toContain('(t."old_record"->>\'version\') = $1::text')
    expect(path.values).toEqual(['1.2.3'])
  })

  it('compiles or, and, and not.cd array literals', () => {
    const compiled = compile({
      kind: 'table',
      name: 'audit_logs',
      args: [],
      operations: [{ method: 'or', args: ['operation.eq.INSERT,and(operation.eq.UPDATE,changed_fields.not.cd.{updated_at})'] }],
    })
    expect(compiled.text).toContain('WHERE (t."operation" = $1::text OR (t."operation" = $2::text AND NOT (t."changed_fields" <@ $3::text[])))')
    expect(compiled.values).toEqual(['INSERT', 'UPDATE', '{updated_at}'])
  })

  it('embeds a foreign key column, an inner target table, and stripe_info', () => {
    const history = compile({
      kind: 'table',
      name: 'deploy_history',
      args: [],
      operations: [
        { method: 'select', args: ['*, version:version_id (id, name)'] },
        { method: 'eq', args: ['app_id', 'com.demo.app'] },
        { method: 'like', args: ['version.name', '%demo%'] },
        { method: 'order', args: ['created_at', { ascending: false, nullsFirst: true }] },
        { method: 'range', args: [10, 19] },
      ],
    })
    expect(history.text).toContain('to_jsonb(t) || jsonb_build_object(\'version\', (SELECT jsonb_build_object(\'id\', e1."id", \'name\', e1."name") FROM "public"."app_versions" AS e1 WHERE e1."id" = t."version_id"))')
    expect(history.text).toContain('EXISTS (SELECT 1 FROM "public"."app_versions" AS ef WHERE ef."id" = t."version_id" AND ef."name" LIKE $2::text)')
    expect(history.text).toContain('ORDER BY t."created_at" DESC NULLS FIRST LIMIT 10 OFFSET 10')
    expect(history.values).toEqual(['com.demo.app', '%demo%'])

    const members = compile({
      kind: 'table',
      name: 'org_users',
      args: [],
      operations: [{ method: 'select', args: ['user_id, users!inner(email)'] }, { method: 'eq', args: ['org_id', 'org-1'] }],
    })
    expect(members.text).toContain('\'users\', (SELECT jsonb_build_object(\'email\', e1."email") FROM "public"."users" AS e1 WHERE e1."id" = t."user_id")')
    expect(members.text).toContain('EXISTS (SELECT 1 FROM "public"."users" AS ei WHERE ei."id" = t."user_id")')

    const billing = compile({
      kind: 'table',
      name: 'orgs',
      args: [],
      operations: [{ method: 'select', args: ['created_at, stripe_info(paid_at, trial_at)'] }, { method: 'maybeSingle', args: [] }],
    })
    expect(billing.text).toContain('\'stripe_info\', (SELECT jsonb_build_object(\'paid_at\', e1."paid_at", \'trial_at\', e1."trial_at") FROM "public"."stripe_info" AS e1 WHERE e1."customer_id" = t."customer_id")')
    expect(billing.cardinality).toBe('maybe')

    const channel = compile({
      kind: 'table',
      name: 'channels',
      args: [],
      operations: [{ method: 'select', args: ['version:app_versions!channels_version_fkey(native_packages)'] }],
    })
    expect(channel.text).toContain('FROM "public"."app_versions" AS e1 WHERE e1."id" = t."version"')
  })

  it('keeps an exact count when the page is empty and caps the page size', () => {
    const compiled = compile({
      kind: 'table',
      name: 'audit_logs',
      args: [],
      operations: [{ method: 'select', args: ['*', { count: 'estimated', head: false }] }, { method: 'limit', args: [5000] }],
    })
    expect(compiled.count).toBe(true)
    expect(compiled.text).toContain('SELECT count(*)::bigint AS total_count FROM "public"."audit_logs" AS t')
    expect(compiled.text).toContain('LEFT JOIN LATERAL')
    expect(compiled.text).toContain('LIMIT 1000')
    expect(compiled.text).not.toContain('LIMIT 5000')

    const head = compile({
      kind: 'table',
      name: 'apps',
      args: [],
      operations: [{ method: 'select', args: ['id', { count: 'exact', head: true }] }],
    })
    expect(head.head).toBe(true)
    expect(head.text).toBe('SELECT count(*)::bigint AS total_count FROM "public"."apps" AS t')
  })

  it('compiles upsert, ignore-duplicates, and a filtered jsonb update', () => {
    const upsert = compile({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'upsert', args: [{ id: 'user-1', email: 'person@example.com' }, { onConflict: 'id' }] }, { method: 'select', args: [] }, { method: 'single', args: [] }],
    })
    expect(upsert.text).toContain('INSERT INTO "public"."users" ("id", "email") VALUES ($1::uuid, $2::text) ON CONFLICT ("id") DO UPDATE SET "email" = EXCLUDED."email" RETURNING *')
    expect(upsert.values).toEqual(['user-1', 'person@example.com'])

    const ignored = compile({
      kind: 'table',
      name: 'group_members',
      args: [],
      operations: [{ method: 'upsert', args: [[{ group_id: 'g', user_id: 'u' }], { onConflict: 'group_id,user_id', ignoreDuplicates: true }] }],
    })
    expect(ignored.text).toContain('ON CONFLICT ("group_id", "user_id") DO NOTHING')

    const update = compile({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'update', args: [{ onboarding: { step: 1 } }] }, { method: 'eq', args: ['id', 'user-1'] }, { method: 'filter', args: ['onboarding', 'eq', '{"step":1}'] }],
    })
    expect(update.text).toContain('SET "onboarding" = $3::jsonb')
    expect(update.text).toContain('t."id" = $1::uuid')
    expect(update.text).toContain('t."onboarding" = $2::jsonb')
    expect(update.values).toEqual(['user-1', '{"step":1}', '{"step":1}'])
  })

  it('rejects identifiers and ambiguous relationships', () => {
    expect(() => compile({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'eq', args: ['id;drop', 'x'] }],
    })).toThrow(/Invalid identifier/)
    expect(() => compile({
      kind: 'table',
      name: 'apps',
      args: [],
      operations: [{ method: 'select', args: ['users(id)'] }],
    })).toThrow(/more than one relationship/)
    expect(() => compile({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'order', args: ['missing'] }],
    })).toThrow(/does not exist/)
  })

  it('picks the RPC overload from the provided argument names', () => {
    const admin = compile({ kind: 'rpc', name: 'is_platform_admin', args: [], operations: [] })
    expect(admin.text).toBe('SELECT to_jsonb(public."is_platform_admin"()) AS data')
    const probe = compile({ kind: 'rpc', name: 'is_not_deleted', args: [{ email_check: 'nobody@example.com' }], operations: [] })
    expect(probe.text).toBe('SELECT to_jsonb(public."is_not_deleted"("email_check" => $1::varchar)) AS data')
    expect(probe.values).toEqual(['nobody@example.com'])
    const members = compile({ kind: 'rpc', name: 'get_org_members', args: [{ guild_id: 'org-1' }], operations: [] })
    expect(members.text).toContain('jsonb_agg(to_jsonb(q)) FROM public."get_org_members"("guild_id" => $1::uuid) AS q')
    expect(members.returnsSet).toBe(true)
  })

  it('shapes pages, cardinality, and scalar RPC results', () => {
    const many = compile({ kind: 'table', name: 'users', args: [], operations: [{ method: 'select', args: ['id'] }] })
    expect(shapeConsoleQueryResult(many, [{ row: { id: 'a' } }, { row: { id: 'b' } }]).data).toEqual([{ id: 'a' }, { id: 'b' }])

    const single = compile({ kind: 'table', name: 'users', args: [], operations: [{ method: 'single', args: [] }] })
    expect(shapeConsoleQueryResult(single, []).error?.code).toBe('PGRST116')
    expect(shapeConsoleQueryResult(single, []).status).toBe(406)
    expect(shapeConsoleQueryResult(single, [{ row: { id: 'a' } }, { row: { id: 'b' } }]).error?.code).toBe('PGRST116')

    const maybe = compile({ kind: 'table', name: 'users', args: [], operations: [{ method: 'maybeSingle', args: [] }] })
    expect(shapeConsoleQueryResult(maybe, []).data).toBeNull()
    expect(shapeConsoleQueryResult(maybe, []).error).toBeNull()

    const counted = compile({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'select', args: ['id', { count: 'exact' }] }],
    })
    const page = shapeConsoleQueryResult(counted, [{ row: null, total_count: '4' }])
    expect(page.data).toEqual([])
    expect(page.count).toBe(4)

    const head = compile({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'select', args: ['id', { count: 'exact', head: true }] }],
    })
    expect(shapeConsoleQueryResult(head, [{ total_count: '8' }])).toEqual({ data: null, error: null, count: 8, status: 200 })

    const rpc = compile({ kind: 'rpc', name: 'is_platform_admin', args: [], operations: [] })
    expect(shapeConsoleQueryResult(rpc, [{ data: false }]).data).toBe(false)
  })
})
