-- The audit-attribution migration redefined this function after the RBAC
-- migration. Keep its audit/tombstone behavior while restoring RBAC ownership
-- and effective-admin handling for scheduled account deletion.
CREATE OR REPLACE FUNCTION public.delete_accounts_marked_for_deletion()
RETURNS TABLE (deleted_count integer, deleted_user_ids uuid [])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  account_record record;
  org_record record;
  deleted_users uuid[] := ARRAY[]::uuid[];
  total_deleted integer := 0;
  replacement_owner_id uuid;
BEGIN
  FOR account_record IN
    SELECT account_id, removal_date, removed_data
    FROM public.to_delete_accounts
    WHERE removal_date < pg_catalog.now()
  LOOP
    BEGIN
      FOR org_record IN
        WITH user_orgs AS (
          SELECT bindings.org_id
          FROM public.role_bindings AS bindings
          WHERE bindings.principal_type = public.rbac_principal_user()
            AND bindings.principal_id = account_record.account_id
            AND bindings.scope_type = public.rbac_scope_org()
            AND bindings.org_id IS NOT NULL
            AND (bindings.expires_at IS NULL OR bindings.expires_at > pg_catalog.now())

          UNION

          SELECT groups.org_id
          FROM public.group_members AS members
          INNER JOIN public.groups AS groups
            ON groups.id = members.group_id
          INNER JOIN public.role_bindings AS bindings
            ON bindings.principal_type = public.rbac_principal_group()
            AND bindings.principal_id = groups.id
            AND bindings.org_id = groups.org_id
            AND bindings.scope_type = public.rbac_scope_org()
          WHERE members.user_id = account_record.account_id
            AND (bindings.expires_at IS NULL OR bindings.expires_at > pg_catalog.now())
        )
        SELECT DISTINCT org_id
        FROM user_orgs
        ORDER BY org_id
      LOOP
        PERFORM public.lock_rbac_orgs(org_record.org_id);

        IF public.is_effective_active_org_super_admin_user(org_record.org_id, account_record.account_id)
          AND NOT public.has_effective_non_expiring_org_super_admin_after_removal(
            org_record.org_id,
            NULL,
            NULL,
            NULL,
            NULL,
            account_record.account_id
          )
        THEN
          -- Preserve the audit migration's tombstone and webhook suppression
          -- behavior while deleting an organization with no durable successor.
          PERFORM pg_catalog.set_config('capgo.deleting_org_id', org_record.org_id::text, true);
          DELETE FROM public.deploy_history WHERE owner_org = org_record.org_id;
          DELETE FROM public.channel_devices WHERE owner_org = org_record.org_id;
          DELETE FROM public.channels WHERE owner_org = org_record.org_id;
          DELETE FROM public.app_versions WHERE owner_org = org_record.org_id;
          DELETE FROM public.apps WHERE owner_org = org_record.org_id;
          DELETE FROM public.orgs WHERE id = org_record.org_id;
          PERFORM pg_catalog.set_config('capgo.deleting_org_id', '', true);
          CONTINUE;
        END IF;

        SELECT candidates.user_id
        INTO replacement_owner_id
        FROM (
          SELECT bindings.principal_id AS user_id, bindings.granted_at
          FROM public.role_bindings AS bindings
          INNER JOIN public.roles AS roles
            ON roles.id = bindings.role_id
            AND roles.scope_type = bindings.scope_type
          WHERE bindings.org_id = org_record.org_id
            AND bindings.principal_type = public.rbac_principal_user()
            AND bindings.principal_id <> account_record.account_id
            AND bindings.scope_type = public.rbac_scope_org()
            AND bindings.expires_at IS NULL
            AND roles.name = public.rbac_role_org_super_admin()

          UNION

          SELECT members.user_id, bindings.granted_at
          FROM public.role_bindings AS bindings
          INNER JOIN public.roles AS roles
            ON roles.id = bindings.role_id
            AND roles.scope_type = bindings.scope_type
          INNER JOIN public.groups AS groups
            ON groups.id = bindings.principal_id
            AND groups.org_id = bindings.org_id
          INNER JOIN public.group_members AS members
            ON members.group_id = groups.id
          WHERE bindings.org_id = org_record.org_id
            AND bindings.principal_type = public.rbac_principal_group()
            AND bindings.scope_type = public.rbac_scope_org()
            AND bindings.expires_at IS NULL
            AND roles.name = public.rbac_role_org_super_admin()
            AND members.user_id <> account_record.account_id
        ) AS candidates
        ORDER BY candidates.granted_at ASC, candidates.user_id ASC
        LIMIT 1;

        IF replacement_owner_id IS NOT NULL THEN
          UPDATE public.apps
          SET user_id = replacement_owner_id, updated_at = pg_catalog.now()
          WHERE user_id = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.app_versions
          SET user_id = replacement_owner_id, updated_at = pg_catalog.now()
          WHERE user_id = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.channels
          SET created_by = replacement_owner_id, updated_at = pg_catalog.now()
          WHERE created_by = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.deploy_history
          SET created_by = replacement_owner_id, updated_at = pg_catalog.now()
          WHERE created_by = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.orgs
          SET created_by = replacement_owner_id, updated_at = pg_catalog.now()
          WHERE id = org_record.org_id AND created_by = account_record.account_id;
        ELSE
          RAISE WARNING 'No durable org_super_admin found to transfer ownership in org % for user %',
            org_record.org_id, account_record.account_id;
        END IF;

      DELETE FROM public.channel_permission_overrides AS overrides
      WHERE (
        overrides.principal_type = public.rbac_principal_user()
        AND overrides.principal_id = account_record.account_id
      ) OR (
        overrides.principal_type = public.rbac_principal_apikey()
        AND EXISTS (
          SELECT 1
          FROM public.apikeys
          WHERE apikeys.rbac_id = overrides.principal_id
            AND apikeys.user_id = account_record.account_id
        )
      );
      END LOOP;

      DELETE FROM public.role_bindings
      WHERE principal_type = public.rbac_principal_user()
        AND principal_id = account_record.account_id;

      DELETE FROM public.role_bindings AS bindings
      USING public.apikeys
      WHERE bindings.principal_type = public.rbac_principal_apikey()
        AND bindings.principal_id = apikeys.rbac_id
        AND apikeys.user_id = account_record.account_id;

      DELETE FROM public.group_members WHERE user_id = account_record.account_id;
      DELETE FROM public.org_users WHERE user_id = account_record.account_id;
      DELETE FROM public.users WHERE id = account_record.account_id;
      DELETE FROM auth.users WHERE id = account_record.account_id;
      DELETE FROM public.to_delete_accounts WHERE account_id = account_record.account_id;

      deleted_users := pg_catalog.array_append(deleted_users, account_record.account_id);
      total_deleted := total_deleted + 1;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to delete account %: %', account_record.account_id, SQLERRM;
    END;
  END LOOP;

  deleted_count := total_deleted;
  deleted_user_ids := deleted_users;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.delete_accounts_marked_for_deletion() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_accounts_marked_for_deletion()
FROM public;
REVOKE ALL ON FUNCTION public.delete_accounts_marked_for_deletion()
FROM anon;
REVOKE ALL ON FUNCTION public.delete_accounts_marked_for_deletion()
FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_accounts_marked_for_deletion()
TO service_role;
