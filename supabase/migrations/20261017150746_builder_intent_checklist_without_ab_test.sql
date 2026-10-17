-- Native-build intent now always selects the Builder checklist. The
-- builder_todo_list_v4 A/B test is retired: before this change only creators in
-- treatment branch A got Builder, and the intent chosen on an additional
-- organization (stored on orgs.onboarding only) was never read.
--
-- The effective intent is the owning organization's intent, falling back to the
-- creator's user intent when the organization has none (missing or the
-- column default "unknown"). "publish" is the
-- web-to-native intent, which the console already treats as Builder.

CREATE OR REPLACE FUNCTION public.app_onboarding_effective_intent(p_owner_org uuid, p_creator uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(NULLIF((SELECT o.onboarding ->> 'intent' FROM public.orgs AS o WHERE o.id = p_owner_org), ''), 'unknown'),
    NULLIF(NULLIF((SELECT u.onboarding ->> 'intent' FROM public.users AS u WHERE u.id = p_creator), ''), 'unknown')
  );
$$;

ALTER FUNCTION public.app_onboarding_effective_intent(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.app_onboarding_effective_intent(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_onboarding_effective_intent(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.assign_app_onboarding_todo_list_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_creator uuid := auth.uid();
  v_setup jsonb;
BEGIN
  IF v_creator IS NULL AND (NEW.onboarding ->> 'created_by_user_id')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    v_creator := (NEW.onboarding ->> 'created_by_user_id')::uuid;
  END IF;
  v_setup := CASE WHEN pg_catalog.jsonb_typeof(NEW.onboarding -> 'setup') = 'object'
    THEN NEW.onboarding -> 'setup' ELSE '{}'::jsonb END;
  IF v_creator IS NOT NULL THEN
    NEW.onboarding := COALESCE(NEW.onboarding, '{}'::jsonb)
      || pg_catalog.jsonb_build_object('created_by_user_id', v_creator::text);
  END IF;

  IF public.app_onboarding_effective_intent(NEW.owner_org, v_creator) IN ('builder', 'publish') THEN
    NEW.onboarding := pg_catalog.jsonb_set(COALESCE(NEW.onboarding, '{}'::jsonb), '{setup}',
      (v_setup - 'ota_todo_list_version' - 'selected_builder_platform')
        || public.new_builder_onboarding_setup_v1(), true);
  ELSE
    NEW.onboarding := pg_catalog.jsonb_set(COALESCE(NEW.onboarding, '{}'::jsonb), '{setup}',
      v_setup || pg_catalog.jsonb_build_object(
        'todo_list_version', 4,
        'ota_todo_list_version', '1',
        'paths', pg_catalog.jsonb_build_array('ota'),
        'selected_path', 'ota',
        'steps', pg_catalog.jsonb_build_object('ota', public.new_ota_onboarding_steps_v1())
      ), true);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.assign_app_onboarding_todo_list_version() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_app_onboarding_todo_list_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_app_onboarding_todo_list_version() TO service_role;

-- Backfill: move apps still onboarding with a native-build intent from the OTA
-- checklist to the Builder checklist. Only apps without OTA progress move;
-- login_cli_mcp is ignored because a CLI login is shared by both paths.
WITH candidates AS (
  SELECT a.id, a.onboarding -> 'setup' AS setup
  FROM public.apps AS a
  WHERE a.need_onboarding IS TRUE
    AND a.onboarding #>> '{setup,todo_list_version}' = '4'
    AND a.onboarding #>> '{setup,ota_todo_list_version}' = '1'
    AND a.onboarding #>> '{setup,selected_path}' = 'ota'
    AND COALESCE(a.onboarding #>> '{setup,outcome}', 'in_progress') = 'in_progress'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_each(
        CASE WHEN pg_catalog.jsonb_typeof(a.onboarding #> '{setup,steps,ota}') = 'object'
          THEN a.onboarding #> '{setup,steps,ota}' ELSE '{}'::jsonb END
      ) AS step(id, value)
      WHERE step.id <> 'login_cli_mcp'
        AND step.value ->> 'status' IN ('done', 'skipped')
    )
    AND public.app_onboarding_effective_intent(
      a.owner_org,
      CASE WHEN (a.onboarding ->> 'created_by_user_id')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (a.onboarding ->> 'created_by_user_id')::uuid END
    ) IN ('builder', 'publish')
)
UPDATE public.apps AS a
SET onboarding = pg_catalog.jsonb_set(
  a.onboarding,
  '{setup}',
  (candidates.setup - 'ota_todo_list_version' - 'selected_builder_platform' - 'paths' - 'selected_path' - 'steps')
    || public.new_builder_onboarding_setup_v1(),
  true
)
FROM candidates
WHERE a.id = candidates.id;
