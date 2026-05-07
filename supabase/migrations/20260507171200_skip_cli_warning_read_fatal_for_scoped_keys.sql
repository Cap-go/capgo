CREATE OR REPLACE FUNCTION public.get_organization_cli_warnings(
    orgid uuid,
    cli_version text
)
RETURNS jsonb []
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  messages jsonb[] := ARRAY[]::jsonb[];
  has_read_access boolean;
  api_key_text text;
  api_key public.apikeys%ROWTYPE;
BEGIN
  PERFORM cli_version;

  SELECT public.get_apikey_header()
  INTO api_key_text;

  IF api_key_text IS NOT NULL THEN
    SELECT *
    INTO api_key
    FROM public.find_apikey_by_value(api_key_text)
    LIMIT 1;
  END IF;

  SELECT public.check_min_rights(
    'read'::public.user_min_right,
    public.get_identity_apikey_only('{write,all,upload,read}'::public.key_mode[]),
    orgid,
    NULL::varchar,
    NULL::bigint
  )
  INTO has_read_access;

  IF NOT COALESCE(has_read_access, false) THEN
    IF api_key_text IS NULL OR api_key.id IS NULL OR public.is_apikey_expired(api_key.expires_at) THEN
      messages := pg_catalog.array_append(messages, pg_catalog.jsonb_build_object(
        'message',
        'API key does not have read access to this organization',
        'fatal',
        true
      ));
    END IF;

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
    messages := pg_catalog.array_append(messages, pg_catalog.jsonb_build_object(
      'message',
      'You have exceeded your storage limit.
Upload will fail, but you can still download your data.
MAU and bandwidth limits are not exceeded.
In order to upload your plan, please upgrade your plan here: https://console.capgo.app/settings/plans.',
      'fatal',
      true
    ));
  END IF;

  RETURN messages;
END;
$$;

ALTER FUNCTION public.get_organization_cli_warnings(uuid, text)
OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_organization_cli_warnings(uuid, text)
FROM public;
GRANT ALL ON FUNCTION public.get_organization_cli_warnings(uuid, text)
TO anon;
GRANT ALL ON FUNCTION public.get_organization_cli_warnings(uuid, text)
TO authenticated;
GRANT ALL ON FUNCTION public.get_organization_cli_warnings(uuid, text)
TO service_role;
