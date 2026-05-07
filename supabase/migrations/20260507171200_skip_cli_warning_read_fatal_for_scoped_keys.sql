CREATE OR REPLACE FUNCTION "public"."get_organization_cli_warnings"("orgid" uuid, "cli_version" text)
RETURNS jsonb[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  messages jsonb[] := ARRAY[]::jsonb[];
  has_read_access boolean;
BEGIN
  PERFORM cli_version;

  SELECT public.check_min_rights(
    'read'::public.user_min_right,
    public.get_identity_apikey_only('{write,all,upload,read}'::public.key_mode[]),
    orgid,
    NULL::varchar,
    NULL::bigint
  )
  INTO has_read_access;

  IF NOT COALESCE(has_read_access, false) THEN
    -- Upload performs app-scoped permission and plan checks after this RPC.
    -- App-scoped API keys may legitimately upload without org-level read access,
    -- so skip org warnings instead of blocking the upload here.
    RETURN messages;
  END IF;

  IF (
    public.is_paying_and_good_plan_org_action(orgid, ARRAY['mau']::public.action_type[]) = true
    AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['bandwidth']::public.action_type[]) = true
    AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['storage']::public.action_type[]) = false
  ) THEN
    messages := array_append(messages, jsonb_build_object(
      'message',
      'You have exceeded your storage limit.\nUpload will fail, but you can still download your data.\nMAU and bandwidth limits are not exceeded.\nIn order to upload your plan, please upgrade your plan here: https://console.capgo.app/settings/plans.',
      'fatal',
      true
    ));
  END IF;

  RETURN messages;
END;
$$;

ALTER FUNCTION "public"."get_organization_cli_warnings"("orgid" uuid, "cli_version" text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" uuid, "cli_version" text) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" uuid, "cli_version" text) TO "anon";
GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" uuid, "cli_version" text) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" uuid, "cli_version" text) TO "service_role";
