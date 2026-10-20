-- Explicit user opt-in, independent of experiment assignments. One indexed
-- apps.app_id lookup/row lock and one bounded RBAC check per authenticated click;
-- this function is never invoked by a policy, trigger, or unfiltered query.
CREATE OR REPLACE FUNCTION public.enable_builder_onboarding(p_app_id character varying)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_org uuid;
  v_onboarding jsonb;
  v_setup jsonb;
  v_version text;
  v_steps jsonb;
  v_builder jsonb;
  v_defaults jsonb := public.new_builder_onboarding_setup_v1() #> '{steps,builder}';
  v_paths jsonb;
BEGIN
  SELECT a.owner_org, COALESCE(a.onboarding, '{}'::jsonb)
  INTO v_owner_org, v_onboarding
  FROM public.apps AS a
  WHERE a.app_id = p_app_id
  FOR UPDATE;

  IF v_owner_org IS NULL OR NOT public.rbac_check_permission_request(
    public.rbac_perm_app_update_settings(), v_owner_org, p_app_id, NULL::bigint
  ) THEN
    RAISE EXCEPTION 'NO_PERMISSION';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_object_agg(field.key, field.value), '{}'::jsonb)
  INTO v_setup
  FROM pg_catalog.jsonb_each(v_onboarding) AS field
  WHERE field.key = ANY (ARRAY[
    'todo_list_version', 'ota_todo_list_version', 'builder_todo_list_version',
    'paths', 'selected_path', 'selected_builder_platform', 'source', 'outcome',
    'steps', 'started_at', 'completed_at', 'updated_at', 'source_updated_at', 'last_run_id'
  ]);
  IF pg_catalog.jsonb_typeof(v_onboarding -> 'setup') = 'object' THEN
    v_setup := v_setup || (v_onboarding -> 'setup');
  END IF;
  v_version := COALESCE(v_setup ->> 'todo_list_version', '2');
  IF v_version NOT IN ('1', '2', '3', '4')
    OR (v_version = '4' AND (
      COALESCE(v_setup ->> 'ota_todo_list_version', '1') <> '1'
      OR COALESCE(v_setup ->> 'builder_todo_list_version', '1') <> '1'
    ))
  THEN
    RAISE EXCEPTION 'UNSUPPORTED_ONBOARDING_VERSION';
  END IF;

  v_steps := CASE WHEN pg_catalog.jsonb_typeof(v_setup -> 'steps') = 'object'
    THEN v_setup -> 'steps' ELSE '{}'::jsonb END;
  v_builder := CASE WHEN pg_catalog.jsonb_typeof(v_steps -> 'builder') = 'object'
    THEN v_steps -> 'builder' ELSE '{}'::jsonb END;
  -- Existing statuses, annotations, history and timestamps win over defaults.
  v_builder := v_builder || pg_catalog.jsonb_build_object(
    'ios', v_defaults -> 'ios' || CASE WHEN pg_catalog.jsonb_typeof(v_builder -> 'ios') = 'object'
      THEN v_builder -> 'ios' ELSE '{}'::jsonb END,
    'android', v_defaults -> 'android' || CASE WHEN pg_catalog.jsonb_typeof(v_builder -> 'android') = 'object'
      THEN v_builder -> 'android' ELSE '{}'::jsonb END
  );
  IF v_version = '3' THEN
    v_paths := '["ota", "builder"]'::jsonb;
    v_setup := v_setup || pg_catalog.jsonb_build_object('ota_todo_list_version', '1');
    v_steps := v_steps || pg_catalog.jsonb_build_object('ota', public.new_ota_onboarding_steps_v1(v_steps));
  ELSIF v_version = '4' THEN
    v_paths := CASE WHEN pg_catalog.jsonb_typeof(v_setup -> 'paths') = 'array'
      THEN v_setup -> 'paths' ELSE '[]'::jsonb END;
    IF NOT v_paths ? 'builder' THEN
      v_paths := v_paths || '["builder"]'::jsonb;
    END IF;
  ELSE
    -- V1/V2 have a different OTA checklist. Keep their old records as history,
    -- but provision only the supported Builder path, as explicitly requested.
    v_paths := '["builder"]'::jsonb;
    v_setup := v_setup - 'ota_todo_list_version';
  END IF;
  v_setup := (v_setup - 'completed_at') || pg_catalog.jsonb_build_object(
    'todo_list_version', 4,
    'builder_todo_list_version', '1',
    'paths', v_paths,
    'selected_path', 'builder',
    'outcome', 'in_progress',
    'steps', v_steps || pg_catalog.jsonb_build_object('builder', v_builder)
  );
  v_onboarding := pg_catalog.jsonb_set(v_onboarding - 'getting_started_dismissed_at', '{setup}', v_setup, true);

  -- Preserve need_onboarding: adding Builder must not reset initial onboarding
  -- or manufacture demo data. Existing sidebar/exploration rules still apply.
  UPDATE public.apps AS a SET onboarding = v_onboarding
  WHERE a.app_id = p_app_id AND a.onboarding IS DISTINCT FROM v_onboarding;
  RETURN v_onboarding;
END;
$$;

ALTER FUNCTION public.enable_builder_onboarding(character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enable_builder_onboarding(character varying) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enable_builder_onboarding(character varying) TO authenticated, service_role;
