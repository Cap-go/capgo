-- Create a small, durable logging helper for RLS-related decisions
-- Logs minimal context to PostgreSQL logs and auto-captures caller function
CREATE OR REPLACE FUNCTION public.pg_log (decision text, input jsonb DEFAULT '{}'::jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  uid uuid;
  req_id text;
  role text;
  ctx text;
  fn text;
BEGIN
  uid := auth.uid();
  req_id := current_setting('request.header.x-request-id', true);
  role := current_setting('request.jwt.claim.role', true);

  -- Best-effort: extract caller from the PL/pgSQL context
  GET DIAGNOSTICS ctx = PG_CONTEXT;
  fn := (
    SELECT regexp_replace(line, '^PL/pgSQL function ([^(]+\([^)]*\)).*$', '\1')
    FROM regexp_split_to_table(ctx, E'\n') AS line
    WHERE line LIKE 'PL/pgSQL function %'
      AND line NOT ILIKE '%pg_log(%'
      AND line NOT ILIKE '%pg_debug(%'
    LIMIT 1
  );
  IF fn IS NULL THEN
    fn := 'unknown';
  END IF;

  -- Trim overly large payloads to avoid noisy logs
  IF length(coalesce(input::text, '{}')) > 2000 THEN
    input := jsonb_build_object('truncated', true);
  END IF;

  RAISE LOG 'RLS LOG: fn=%, decision=%, uid=%, role=%, req_id=%, input=%'
    , fn
    , decision
    , uid
    , coalesce(role, 'null')
    , coalesce(req_id, 'null')
    , coalesce(input::text, '{}');
EXCEPTION WHEN OTHERS THEN
  -- Never let logging break execution paths
  NULL;
END;
$$;

ALTER FUNCTION public.pg_log (text, jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.pg_log (text, jsonb)
FROM
  PUBLIC;

-- Centralize deny logging inside core rights helpers used by RLS
-- A) check_min_rights overload without user_id (delegates to the one below)
CREATE OR REPLACE FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
  allowed boolean;
BEGIN
  allowed := check_min_rights(min_right, (select auth.uid()), org_id, app_id, channel_id);
  RETURN allowed;
END;
$$;

-- B) check_min_rights with explicit user_id
CREATE OR REPLACE FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    user_right_record RECORD;
BEGIN
    IF user_id IS NULL THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_NO_UID', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text));
        RETURN false;
    END IF;

    FOR user_right_record IN
        SELECT org_users.user_right, org_users.app_id, org_users.channel_id
        FROM public.org_users
        WHERE org_users.org_id = check_min_rights.org_id AND org_users.user_id = check_min_rights.user_id
    LOOP
        IF (user_right_record.user_right >= min_right AND user_right_record.app_id IS NULL AND user_right_record.channel_id IS NULL) OR
           (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights.app_id AND user_right_record.channel_id IS NULL) OR
           (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights.app_id AND user_right_record.channel_id = check_min_rights.channel_id)
        THEN
            RETURN true;
        END IF;
    END LOOP;

    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
    RETURN false;
END;
$$;

-- C) has_app_right_userid – log when rights check fails
CREATE OR REPLACE FUNCTION "public"."has_app_right_userid" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid"
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  org_id uuid;
  allowed boolean;
Begin
  org_id := public.get_user_main_org_id_by_app_id(appid);

  allowed := public.check_min_rights("right", userid, org_id, "appid", NULL::bigint);
  IF NOT allowed THEN
    PERFORM public.pg_log('deny: HAS_APP_RIGHT_USERID', jsonb_build_object('appid', appid, 'org_id', org_id, 'right', "right"::text, 'userid', userid));
  END IF;
  RETURN allowed;
End;
$$;

-- D) has_app_right_apikey – log when api key/org/app restrictions deny or rights deny
CREATE OR REPLACE FUNCTION "public"."has_app_right_apikey" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid",
  "apikey" "text"
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  org_id uuid;
  api_key record;
  allowed boolean;
Begin
  org_id := public.get_user_main_org_id_by_app_id(appid);

  SELECT * FROM public.apikeys WHERE key = apikey INTO api_key;
  IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
          PERFORM public.pg_log('deny: APIKEY_ORG_RESTRICT', jsonb_build_object('org_id', org_id, 'appid', appid));
          RETURN false;
      END IF;
  END IF;

  IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
    IF NOT (appid = ANY(api_key.limited_to_apps)) THEN
        PERFORM public.pg_log('deny: APIKEY_APP_RESTRICT', jsonb_build_object('appid', appid));
        RETURN false;
    END IF;
  END IF;

  allowed := public.check_min_rights("right", userid, org_id, "appid", NULL::bigint);
  IF NOT allowed THEN
    PERFORM public.pg_log('deny: HAS_APP_RIGHT_APIKEY', jsonb_build_object('appid', appid, 'org_id', org_id, 'right', "right"::text, 'userid', userid));
  END IF;
  RETURN allowed;
End;
$$;

-- E) get_identity_org_allowed – log when identity resolution fails/denies
CREATE OR REPLACE FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode" [], "org_id" "uuid") RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT "public"."get_apikey_header"() into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    PERFORM public.pg_log('deny: IDENTITY_ORG_NO_AUTH', jsonb_build_object('org_id', org_id));
    RETURN NULL;
  END IF;

  -- Fetch the api key
  select * FROM public.apikeys
  where key=api_key_text AND
  mode=ANY(keymode)
  limit 1 into api_key;

  if api_key IS DISTINCT FROM  NULL THEN
    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
          PERFORM public.pg_log('deny: IDENTITY_ORG_UNALLOWED', jsonb_build_object('org_id', org_id));
          RETURN NULL;
      END IF;
    END IF;
    RETURN api_key.user_id;
  END IF;

  PERFORM public.pg_log('deny: IDENTITY_ORG_NO_MATCH', jsonb_build_object('org_id', org_id));
  RETURN NULL;
End;
$$;

-- F) get_identity_org_appid – log when identity resolution fails/denies
CREATE OR REPLACE FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode" [],
  "org_id" "uuid",
  "app_id" character varying
) RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT "public"."get_apikey_header"() into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    PERFORM public.pg_log('deny: IDENTITY_APP_NO_AUTH', jsonb_build_object('org_id', org_id, 'app_id', app_id));
    RETURN NULL;
  END IF;

  -- Fetch the api key
  select * FROM public.apikeys
  where key=api_key_text AND
  mode=ANY(keymode)
  limit 1 into api_key;

  if api_key IS DISTINCT FROM  NULL THEN
    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
          PERFORM public.pg_log('deny: IDENTITY_APP_ORG_UNALLOWED', jsonb_build_object('org_id', org_id, 'app_id', app_id));
          RETURN NULL;
      END IF;
    END IF;
    IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
      IF NOT (app_id = ANY(api_key.limited_to_apps)) THEN
          PERFORM public.pg_log('deny: IDENTITY_APP_UNALLOWED', jsonb_build_object('app_id', app_id));
          RETURN NULL;
      END IF;
    END IF;

    RETURN api_key.user_id;
  END IF;

  PERFORM public.pg_log('deny: IDENTITY_APP_NO_MATCH', jsonb_build_object('org_id', org_id, 'app_id', app_id));
  RETURN NULL;
End;
$$;

-- Optional: drop old helper if it was previously created via seeds
-- (Safe even if it does not exist.)
DROP FUNCTION IF EXISTS public.pg_debug (text, jsonb);

-- Instrument selected functions to log on deny/auth failures
-- 1) public.get_org_members(guild_id uuid) – log before NO_RIGHTS
CREATE OR REPLACE FUNCTION "public"."get_org_members" ("guild_id" "uuid") RETURNS TABLE (
  "aid" bigint,
  "uid" "uuid",
  "email" character varying,
  "image_url" character varying,
  "role" "public"."user_min_right",
  "is_tmp" boolean
) LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = '' AS $$
begin
  IF NOT (public.check_min_rights('read'::public.user_min_right, (select auth.uid()), get_org_members.guild_id, NULL::character varying, NULL::bigint)) THEN
    PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('guild_id', get_org_members.guild_id, 'uid', auth.uid()));
    raise exception 'NO_RIGHTS';
  END IF;

  return query select * from public.get_org_members((select auth.uid()), get_org_members.guild_id);
End;
$$;

-- 2) public.get_org_owner_id(apikey text, app_id text) – log before NO_RIGHTS
CREATE OR REPLACE FUNCTION "public"."get_org_owner_id" ("apikey" "text", "app_id" "text") RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Declare
 org_owner_id uuid;
 real_user_id uuid;
 org_id uuid;
Begin
  SELECT apps.user_id FROM public.apps WHERE apps.app_id=get_org_owner_id.app_id into org_owner_id;
  SELECT public.get_user_main_org_id_by_app_id(app_id) INTO org_id;

  SELECT user_id
  INTO real_user_id
  FROM public.apikeys
  WHERE key=apikey;

  IF (public.is_member_of_org(real_user_id, org_id) IS FALSE)
  THEN
    PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('app_id', get_org_owner_id.app_id, 'org_id', org_id, 'real_user_id', real_user_id));
    raise exception 'NO_RIGHTS';
  END IF;

  RETURN org_owner_id;
End;
$$;

-- 3) public.get_org_perm_for_apikey(apikey text, app_id text) – log on invalid/none
CREATE OR REPLACE FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") RETURNS "text" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
<<get_org_perm_for_apikey>>
Declare
  apikey_user_id uuid;
  org_id uuid;
  user_perm "public"."user_min_right";
BEGIN
  SELECT public.get_user_id(apikey) into apikey_user_id;

  IF apikey_user_id IS NULL THEN
    PERFORM public.pg_log('deny: INVALID_APIKEY', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    return 'INVALID_APIKEY';
  END IF;

  SELECT owner_org FROM public.apps
  INTO org_id
  WHERE apps.app_id=get_org_perm_for_apikey.app_id
  limit 1;

  IF org_id IS NULL THEN
    PERFORM public.pg_log('deny: NO_APP', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    return 'NO_APP';
  END IF;

  SELECT user_right FROM public.org_users
  INTO user_perm
  WHERE user_id=apikey_user_id
  AND org_users.org_id=get_org_perm_for_apikey.org_id;

  IF user_perm IS NULL THEN
    PERFORM public.pg_log('deny: perm_none', jsonb_build_object('org_id', org_id, 'apikey_user_id', apikey_user_id));
    return 'perm_none';
  END IF;

  -- For compatibility reasons if you are a super_admin we will return "owner"
  -- The old cli relies on this behaviour, on get_org_perm_for_apikey_v2 we will change that
  IF user_perm='super_admin'::"public"."user_min_right" THEN
    return 'perm_owner';
  END IF;

  RETURN format('perm_%s', user_perm);
END;$$;

-- 6) public.invite_user_to_org – log when permission checks fail
CREATE OR REPLACE FUNCTION "public"."invite_user_to_org" (
  "email" character varying,
  "org_id" "uuid",
  "invite_type" "public"."user_min_right"
) RETURNS character varying LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = '' AS $$
Declare
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
Begin
  SELECT * FROM public.orgs
  INTO org
  WHERE public.orgs.id=invite_user_to_org.org_id;

  IF org IS NULL THEN
    return 'NO_ORG';
  END IF;

  if NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::character varying, NULL::bigint)) THEN
    PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('org_id', invite_user_to_org.org_id, 'email', invite_user_to_org.email, 'invite_type', invite_user_to_org.invite_type));
    return 'NO_RIGHTS';
  END IF;


  if NOT (public.check_min_rights('super_admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::character varying, NULL::bigint) AND (invite_type is distinct from 'super_admin'::"public"."user_min_right" or invite_type is distinct from 'invite_super_admin'::"public"."user_min_right")) THEN
    PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('org_id', invite_user_to_org.org_id, 'email', invite_user_to_org.email, 'invite_type', invite_user_to_org.invite_type));
    return 'NO_RIGHTS';
  END IF;

  SELECT public.users.id FROM public.users
  INTO invited_user
  WHERE public.users.email=invite_user_to_org.email;

  IF FOUND THEN
    -- INSERT INTO org_users (user_id, org_id, user_right)
    -- VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

    SELECT public.org_users.id from public.org_users
    INTO current_record
    WHERE public.org_users.user_id=invited_user.id
    AND public.org_users.org_id=invite_user_to_org.org_id;

    IF FOUND THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO public.org_users (user_id, org_id, user_right)
      VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

      RETURN 'OK';
    END IF;
  ELSE
    SELECT * FROM public.tmp_users
    INTO current_tmp_user
    WHERE public.tmp_users.email=invite_user_to_org.email
    AND public.tmp_users.org_id=invite_user_to_org.org_id;

    IF FOUND THEN
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        -- Check if cancelled less than 3 hours ago
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN
          RETURN 'TOO_RECENT_INVITATION_CANCELATION';
        ELSE
          RETURN 'NO_EMAIL'; -- Allow reinvitation after 3 hours
        END IF;
      ELSE
        RETURN 'ALREADY_INVITED';
      END IF;
    ELSE
      return 'NO_EMAIL'; -- This is expected. the frontend expects this response.
    END IF;

    return 'NO_EMAIL';
  END IF;
End;
$$;

-- 7) public.rescind_invitation – log when permission checks fail
CREATE OR REPLACE FUNCTION "public"."rescind_invitation" ("email" TEXT, "org_id" UUID) RETURNS character varying LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  tmp_user record;
  org record;
BEGIN
  -- Check if org exists
  SELECT * FROM public.orgs
  INTO org
  WHERE public.orgs.id = rescind_invitation.org_id;

  IF NOT FOUND THEN
    RETURN 'NO_ORG';
  END IF;

  -- Check if user has admin rights
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], rescind_invitation.org_id)), rescind_invitation.org_id, NULL::character varying, NULL::bigint)) THEN
    PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('org_id', rescind_invitation.org_id, 'email', rescind_invitation.email));
    RETURN 'NO_RIGHTS';
  END IF;

  -- Find the temporary user
  SELECT * FROM public.tmp_users
  INTO tmp_user
  WHERE public.tmp_users.email = rescind_invitation.email
  AND public.tmp_users.org_id = rescind_invitation.org_id;

  IF NOT FOUND THEN
    RETURN 'NO_INVITATION';
  END IF;

  -- Check if already cancelled
  IF tmp_user.cancelled_at IS NOT NULL THEN
    RETURN 'ALREADY_CANCELLED';
  END IF;

  -- Update the cancelled_at field
  UPDATE public.tmp_users
  SET cancelled_at = CURRENT_TIMESTAMP
  WHERE public.tmp_users.id = tmp_user.id;

  RETURN 'OK';
END;
$$;

-- 8) public.modify_permissions_tmp – log when permission checks fail
CREATE OR REPLACE FUNCTION "public"."modify_permissions_tmp" (
  "email" TEXT,
  "org_id" UUID,
  "new_role" "public"."user_min_right"
) RETURNS character varying LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  tmp_user record;
  org record;
  non_invite_role "public"."user_min_right";
BEGIN
  -- Convert the role to non-invite format for permission checks
  non_invite_role := public.transform_role_to_non_invite(new_role);

  -- Check if org exists
  SELECT * FROM public.orgs
  INTO org
  WHERE public.orgs.id = modify_permissions_tmp.org_id;

  IF NOT FOUND THEN
    RETURN 'NO_ORG';
  END IF;

  -- Check if user has admin rights
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], modify_permissions_tmp.org_id)), modify_permissions_tmp.org_id, NULL::character varying, NULL::bigint)) THEN
    PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('org_id', modify_permissions_tmp.org_id, 'email', modify_permissions_tmp.email, 'new_role', modify_permissions_tmp.new_role));
    RETURN 'NO_RIGHTS';
  END IF;

  -- Special permission check for super_admin roles
  IF (non_invite_role = 'super_admin'::public.user_min_right) THEN
    IF NOT (public.check_min_rights('super_admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], modify_permissions_tmp.org_id)), modify_permissions_tmp.org_id, NULL::character varying, NULL::bigint)) THEN
      PERFORM public.pg_log('deny: NO_RIGHTS_FOR_SUPER_ADMIN', jsonb_build_object('org_id', modify_permissions_tmp.org_id, 'email', modify_permissions_tmp.email));
      RETURN 'NO_RIGHTS_FOR_SUPER_ADMIN';
    END IF;
  END IF;

  -- Find the temporary user
  SELECT * FROM public.tmp_users
  INTO tmp_user
  WHERE public.tmp_users.email = modify_permissions_tmp.email
  AND public.tmp_users.org_id = modify_permissions_tmp.org_id;

  IF NOT FOUND THEN
    RETURN 'NO_INVITATION';
  END IF;

  -- Check if invitation has been cancelled
  IF tmp_user.cancelled_at IS NOT NULL THEN
    RETURN 'INVITATION_CANCELLED';
  END IF;

  -- Make sure we store the non-invite role (we store the raw roles in tmp_users)
  UPDATE public.tmp_users
  SET role = non_invite_role,
      updated_at = CURRENT_TIMESTAMP
  WHERE public.tmp_users.id = tmp_user.id;

  RETURN 'OK';
END;
$$;

-- 9) public.get_organization_cli_warnings – log when API key lacks read access
CREATE OR REPLACE FUNCTION "public"."get_organization_cli_warnings" ("orgid" "uuid", "cli_version" "text") RETURNS "jsonb" [] LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    messages jsonb[] := '{}';
    has_read_access boolean;
BEGIN
    -- Check if API key has read access
    SELECT public.check_min_rights('read'::"public"."user_min_right", public.get_identity_apikey_only('{write,all,upload,read}'::"public"."key_mode"[]), orgid, NULL::character varying, NULL::bigint) INTO has_read_access;

    IF NOT has_read_access THEN
        PERFORM public.pg_log('deny: API_KEY_NO_READ', jsonb_build_object('org_id', orgid));
        messages := array_append(messages, jsonb_build_object(
            'message', 'API key does not have read access to this organization',
            'fatal', true
        ));
        RETURN messages;
    END IF;

    -- test the user plan
    IF (public.is_paying_and_good_plan_org_action(orgid, ARRAY['mau']::"public"."action_type"[]) = true AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['bandwidth']::"public"."action_type"[]) = true AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['storage']::"public"."action_type"[]) = false) THEN
        messages := array_append(messages, jsonb_build_object(
            'message', 'You have exceeded your storage limit.\nUpload will fail, but you can still download your data.\nMAU and bandwidth limits are not exceeded.\nIn order to upload your data, please upgrade your plan here: https://console.capgo.app/settings/plans.',
            'fatal', true
        ));
    END IF;

    RETURN messages;
END;
$$;

-- 10) public.transfer_app – log when rights checks fail
CREATE OR REPLACE FUNCTION "public"."transfer_app" (
  "p_app_id" character varying,
  "p_new_org_id" "uuid"
) RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    v_old_org_id uuid;
    v_user_id uuid;
    v_last_transfer jsonb;
    v_last_transfer_date timestamp;
BEGIN
  -- Get the current owner_org
  SELECT owner_org, transfer_history[array_length(transfer_history, 1)]
  INTO v_old_org_id, v_last_transfer
  FROM public.apps
  WHERE app_id = p_app_id;

  -- Check if app exists
  IF v_old_org_id IS NULL THEN
      RAISE EXCEPTION 'App % not found', p_app_id;
  END IF;

  -- Get the current user ID
  v_user_id := (select auth.uid());

  IF NOT (public.check_min_rights('super_admin'::"public"."user_min_right", v_user_id, v_old_org_id, NULL::character varying, NULL::bigint)) THEN
    PERFORM public.pg_log('deny: TRANSFER_OLD_ORG_RIGHTS', jsonb_build_object('app_id', p_app_id, 'old_org_id', v_old_org_id, 'new_org_id', p_new_org_id, 'uid', v_user_id));
    RAISE EXCEPTION 'You are not authorized to transfer this app. (You don''t have super_admin rights on the old organization)';
  END IF;

  IF NOT (public.check_min_rights('super_admin'::"public"."user_min_right", v_user_id, p_new_org_id, NULL::character varying, NULL::bigint)) THEN
    PERFORM public.pg_log('deny: TRANSFER_NEW_ORG_RIGHTS', jsonb_build_object('app_id', p_app_id, 'old_org_id', v_old_org_id, 'new_org_id', p_new_org_id, 'uid', v_user_id));
    RAISE EXCEPTION 'You are not authorized to transfer this app. (You don''t have super_admin rights on the new organization)';
  END IF;

  -- Check if enough time has passed since last transfer
  IF v_last_transfer IS NOT NULL THEN
    v_last_transfer_date := (v_last_transfer->>'transferred_at')::timestamp;
    IF v_last_transfer_date + interval '32 days' > now() THEN
      RAISE EXCEPTION 'Cannot transfer app. Must wait at least 32 days between transfers. Last transfer was on %', v_last_transfer_date;
    END IF;
  END IF;

  -- Update the app's owner_org and user_id
  UPDATE public.apps
  SET
      owner_org = p_new_org_id,
      updated_at = now(),
      transfer_history = COALESCE(transfer_history, '{}') || jsonb_build_object(
          'transferred_at', now(),
          'transferred_from', v_old_org_id,
          'transferred_to', p_new_org_id,
          'initiated_by', v_user_id
      )::jsonb
  WHERE app_id = p_app_id;

  -- Update app_versions owner_org
  UPDATE public.app_versions
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update app_versions_meta owner_org
  UPDATE public.app_versions_meta
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update channel_devices owner_org
  UPDATE public.channel_devices
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update channels owner_org
  UPDATE public.channels
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update notifications owner_org
  UPDATE public.notifications
  SET owner_org = p_new_org_id
  WHERE owner_org = v_old_org_id;
END;
$$;

-- 4) public.get_orgs_v6() – log on auth failures
CREATE OR REPLACE FUNCTION "public"."get_orgs_v6" () RETURNS TABLE (
  "gid" "uuid",
  "created_by" "uuid",
  "logo" "text",
  "name" "text",
  "role" character varying,
  "paying" boolean,
  "trial_left" integer,
  "can_use_more" boolean,
  "is_canceled" boolean,
  "app_count" bigint,
  "subscription_start" timestamp with time zone,
  "subscription_end" timestamp with time zone,
  "management_email" "text",
  "is_yearly" boolean
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  api_key_text text;
  api_key record;
  user_id uuid;
BEGIN
  SELECT "public"."get_apikey_header"() into api_key_text;
  user_id := NULL;

  -- Check for API key first
  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.apikeys WHERE key=api_key_text into api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    user_id := api_key.user_id;

    -- Check limited_to_orgs only if api_key exists and has restrictions
    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      return query select orgs.* FROM public.get_orgs_v6(user_id) orgs
      where orgs.gid = ANY(api_key.limited_to_orgs::uuid[]);
      RETURN;
    END IF;
  END IF;

  -- If no valid API key user_id yet, try to get FROM public.identity
  IF user_id IS NULL THEN
    SELECT public.get_identity() into user_id;

    IF user_id IS NULL THEN
      PERFORM public.pg_log('deny: UNAUTHENTICATED', '{}'::jsonb);
      RAISE EXCEPTION 'No authentication provided - API key or valid session required';
    END IF;
  END IF;

  return query select * FROM public.get_orgs_v6(user_id);
END;
$$;

-- 5) public.public.check_org_user_privileges() – log on privilege escalation
CREATE OR REPLACE FUNCTION "public"."public.check_org_user_privileges" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$BEGIN

  -- here we check if the user is a service role in order to bypass this permission check
  IF (((SELECT auth.jwt() ->> 'role')='service_role') OR ((select current_user) IS NOT DISTINCT FROM 'postgres')) THEN
    RETURN NEW;
  END IF;

  IF ("public"."check_min_rights"('super_admin'::"public"."user_min_right", (select auth.uid()), NEW.org_id, NULL::character varying, NULL::bigint))
  THEN
    RETURN NEW;
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'super_admin'::"public"."user_min_right"
  THEN
    PERFORM public.pg_log('deny: ELEVATE_SUPER_ADMIN', jsonb_build_object('org_id', NEW.org_id, 'uid', auth.uid()));
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'invite_super_admin'::"public"."user_min_right"
  THEN
    PERFORM public.pg_log('deny: ELEVATE_INVITE_SUPER_ADMIN', jsonb_build_object('org_id', NEW.org_id, 'uid', auth.uid()));
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  RETURN NEW;
END;$$;
