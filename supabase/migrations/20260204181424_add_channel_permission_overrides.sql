-- Channel permission overrides (delta-only)
CREATE TABLE IF NOT EXISTS public.channel_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_type text NOT NULL CHECK (principal_type IN (
    public.rbac_principal_user(),
    public.rbac_principal_group(),
    public.rbac_principal_apikey()
  )),
  principal_id uuid NOT NULL,
  channel_id bigint NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  is_allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.channel_permission_overrides IS 'Delta-only overrides for channel-scoped permissions (user > group, deny > allow).';
COMMENT ON COLUMN public.channel_permission_overrides.principal_type IS 'user | group | apikey.';
COMMENT ON COLUMN public.channel_permission_overrides.principal_id IS 'users.id, groups.id, or apikeys.rbac_id depending on principal_type.';
COMMENT ON COLUMN public.channel_permission_overrides.channel_id IS 'public.channels.id target for the override.';
COMMENT ON COLUMN public.channel_permission_overrides.permission_key IS 'RBAC permission key (channel.*).';

CREATE UNIQUE INDEX IF NOT EXISTS channel_permission_overrides_unique
  ON public.channel_permission_overrides (principal_type, principal_id, channel_id, permission_key);

CREATE INDEX IF NOT EXISTS channel_permission_overrides_channel_idx
  ON public.channel_permission_overrides (channel_id);

CREATE INDEX IF NOT EXISTS channel_permission_overrides_principal_idx
  ON public.channel_permission_overrides (principal_type, principal_id);

CREATE INDEX IF NOT EXISTS channel_permission_overrides_permission_idx
  ON public.channel_permission_overrides (permission_key);

ALTER TABLE public.channel_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_permission_overrides_admin_select ON public.channel_permission_overrides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.channels
      JOIN public.apps ON apps.app_id = channels.app_id
      WHERE public.rbac_check_permission(
        public.rbac_perm_app_update_user_roles(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
    )
  );

CREATE POLICY channel_permission_overrides_admin_write ON public.channel_permission_overrides
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.channels
      JOIN public.apps ON apps.app_id = channels.app_id
      WHERE public.rbac_check_permission(
        public.rbac_perm_app_update_user_roles(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.channels
      JOIN public.apps ON apps.app_id = channels.app_id
      WHERE public.rbac_check_permission(
        public.rbac_perm_app_update_user_roles(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
    )
  );

-- Extend app_uploader defaults to channel-level permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_channel_read(),
  public.rbac_perm_channel_read_history(),
  public.rbac_perm_channel_promote_bundle()
)
WHERE r.name = public.rbac_role_app_uploader()
ON CONFLICT DO NOTHING;

-- Apply channel overrides in RBAC permission checks
CREATE OR REPLACE FUNCTION public.rbac_check_permission_direct(
  p_permission_key text,
  p_user_id uuid,
  p_org_id uuid,
  p_app_id character varying,
  p_channel_id bigint,
  p_apikey text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  v_allowed boolean := false;
  v_use_rbac boolean;
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_legacy_right public.user_min_right;
  v_apikey_principal uuid;
  v_override boolean;
  v_channel_scope boolean := false;
  v_org_enforcing_2fa boolean;
  v_password_policy_ok boolean;
BEGIN
  -- Validate permission key
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    PERFORM public.pg_log('deny: RBAC_CHECK_PERM_NO_KEY', jsonb_build_object('user_id', p_user_id));
    RETURN false;
  END IF;

  IF p_channel_id IS NOT NULL AND p_permission_key LIKE 'channel.%' THEN
    v_channel_scope := true;
  END IF;

  -- Derive org from app/channel when not provided
  IF v_effective_org_id IS NULL AND p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;
  END IF;

  IF v_effective_org_id IS NULL AND p_channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;
  END IF;

  -- Resolve user from API key when needed (handles hashed keys too).
  IF v_effective_user_id IS NULL AND p_apikey IS NOT NULL THEN
    SELECT user_id INTO v_effective_user_id
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;
  END IF;

  -- Enforce 2FA if the org requires it.
  IF v_effective_org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE id = v_effective_org_id;

    IF v_org_enforcing_2fa = true AND (v_effective_user_id IS NULL OR NOT public.has_2fa_enabled(v_effective_user_id)) THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_2FA_ENFORCEMENT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'user_id', v_effective_user_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- Enforce password policy if enabled for the org.
  IF v_effective_org_id IS NOT NULL THEN
    v_password_policy_ok := public.user_meets_password_policy(v_effective_user_id, v_effective_org_id);
    IF v_password_policy_ok = false THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_PASSWORD_POLICY_ENFORCEMENT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'user_id', v_effective_user_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- Check if RBAC is enabled for this org
  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);

  IF v_use_rbac THEN
    -- RBAC path: Check user permission directly
    IF p_user_id IS NOT NULL THEN
      v_allowed := public.rbac_has_permission(public.rbac_principal_user(), p_user_id, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);

      IF v_channel_scope THEN
        -- Direct user override
        SELECT o.is_allowed INTO v_override
        FROM public.channel_permission_overrides o
        WHERE o.principal_type = public.rbac_principal_user()
          AND o.principal_id = p_user_id
          AND o.channel_id = p_channel_id
          AND o.permission_key = p_permission_key
        LIMIT 1;

        IF v_override IS NOT NULL THEN
          v_allowed := v_override;
        ELSE
          -- Group overrides (deny > allow)
          IF EXISTS (
            SELECT 1
            FROM public.channel_permission_overrides o
            JOIN public.group_members gm ON gm.group_id = o.principal_id AND gm.user_id = p_user_id
            JOIN public.groups g ON g.id = gm.group_id
            WHERE o.principal_type = public.rbac_principal_group()
              AND o.channel_id = p_channel_id
              AND o.permission_key = p_permission_key
              AND o.is_allowed = false
              AND g.org_id = v_effective_org_id
          ) THEN
            v_allowed := false;
          ELSIF EXISTS (
            SELECT 1
            FROM public.channel_permission_overrides o
            JOIN public.group_members gm ON gm.group_id = o.principal_id AND gm.user_id = p_user_id
            JOIN public.groups g ON g.id = gm.group_id
            WHERE o.principal_type = public.rbac_principal_group()
              AND o.channel_id = p_channel_id
              AND o.permission_key = p_permission_key
              AND o.is_allowed = true
              AND g.org_id = v_effective_org_id
          ) THEN
            v_allowed := true;
          END IF;
        END IF;
      END IF;
    END IF;

    -- If user doesn't have permission, check apikey permission
    IF NOT v_allowed AND p_apikey IS NOT NULL THEN
      SELECT rbac_id INTO v_apikey_principal
      FROM public.apikeys
      WHERE key = p_apikey
      LIMIT 1;

      IF v_apikey_principal IS NOT NULL THEN
        v_allowed := public.rbac_has_permission(public.rbac_principal_apikey(), v_apikey_principal, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);

        IF v_channel_scope THEN
          SELECT o.is_allowed INTO v_override
          FROM public.channel_permission_overrides o
          WHERE o.principal_type = public.rbac_principal_apikey()
            AND o.principal_id = v_apikey_principal
            AND o.channel_id = p_channel_id
            AND o.permission_key = p_permission_key
          LIMIT 1;

          IF v_override IS NOT NULL THEN
            v_allowed := v_override;
          END IF;
        END IF;
      END IF;
    END IF;

    IF NOT v_allowed THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_DIRECT', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', p_user_id,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
    END IF;

    RETURN v_allowed;
  ELSE
    -- Legacy path: Map permission to min_right and use legacy check
    v_legacy_right := public.rbac_legacy_right_for_permission(p_permission_key);

    IF v_legacy_right IS NULL THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_UNKNOWN_LEGACY', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', p_user_id
      ));
      RETURN false;
    END IF;

    IF p_apikey IS NOT NULL AND p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_apikey(p_app_id, v_legacy_right, p_user_id, p_apikey);
    ELSIF p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_userid(p_app_id, v_legacy_right, p_user_id);
    ELSE
      RETURN public.check_min_rights_legacy(v_legacy_right, p_user_id, v_effective_org_id, p_app_id, p_channel_id);
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.rbac_check_permission_direct(text, uuid, uuid, character varying, bigint, text) IS
  'Direct RBAC permission check with automatic legacy fallback based on org feature flag. Uses channel overrides when present.';
