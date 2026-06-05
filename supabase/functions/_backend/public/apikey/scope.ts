import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { closeClient, getPgClient } from '../../utils/pg.ts'

type ApiKeyRow = Database['public']['Tables']['apikeys']['Row']

export async function apiKeyHasLimitedScope(c: Context<MiddlewareKeyVariables>, apikey: ApiKeyRow | undefined) {
  if (!apikey)
    return false

  if (!apikey.rbac_id)
    return false

  const pgClient = getPgClient(c)
  try {
    const result = await pgClient.query<{ is_limited: boolean }>(
      `
      WITH user_orgs AS (
        SELECT rb.org_id
        FROM public.role_bindings rb
        WHERE rb.principal_type = public.rbac_principal_user()
          AND rb.principal_id = $1::uuid
          AND rb.org_id IS NOT NULL
          AND (rb.expires_at IS NULL OR rb.expires_at > now())

        UNION

        SELECT g.org_id
        FROM public.group_members gm
        INNER JOIN public.groups g ON g.id = gm.group_id
        INNER JOIN public.role_bindings rb
          ON rb.principal_type = public.rbac_principal_group()
          AND rb.principal_id = gm.group_id
          AND rb.org_id = g.org_id
        WHERE gm.user_id = $1::uuid
          AND rb.org_id IS NOT NULL
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
      ),
      active_bindings AS (
        SELECT rb.scope_type, rb.org_id, r.name AS role_name
        FROM public.role_bindings rb
        INNER JOIN public.roles r ON r.id = rb.role_id
        WHERE rb.principal_type = public.rbac_principal_apikey()
          AND rb.principal_id = $2::uuid
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
      )
      SELECT (
        EXISTS (
          SELECT 1
          FROM active_bindings
          WHERE scope_type <> public.rbac_scope_org()
        )
        OR EXISTS (
          SELECT 1
          FROM user_orgs u
          WHERE NOT EXISTS (
            SELECT 1
            FROM active_bindings b
            WHERE b.scope_type = public.rbac_scope_org()
              AND b.org_id = u.org_id
              AND b.role_name IN (public.rbac_role_org_super_admin(), public.rbac_role_org_admin())
          )
        )
        OR NOT EXISTS (
          SELECT 1
          FROM active_bindings b
          WHERE b.scope_type = public.rbac_scope_org()
            AND b.role_name IN (public.rbac_role_org_super_admin(), public.rbac_role_org_admin())
        )
      ) AS is_limited
      `,
      [apikey.user_id, apikey.rbac_id],
    )

    return result.rows[0]?.is_limited ?? true
  }
  finally {
    await closeClient(c, pgClient)
  }
}
