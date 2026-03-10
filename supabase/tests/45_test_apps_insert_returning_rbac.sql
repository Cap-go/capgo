BEGIN;

SELECT plan(4);

DO $$
DECLARE
  v_org_id uuid := gen_random_uuid();
  v_limited_key text := gen_random_uuid()::text;
BEGIN
  PERFORM set_config(
    'test.apps_returning_rbac_allowed_app_id',
    'com.rbac.insert.returning',
    false
  );
  PERFORM set_config(
    'test.apps_returning_rbac_blocked_app_id',
    'com.rbac.insert.blocked',
    false
  );

  INSERT INTO public.orgs (
    id,
    created_by,
    name,
    management_email,
    use_new_rbac
  )
  VALUES (
    v_org_id,
    tests.get_supabase_uid('test_user'),
    'RBAC apps returning test',
    'rbac-apps-returning@test.com',
    true
  );

  PERFORM set_config('test.apps_returning_rbac_org_id', v_org_id::text, false);
  PERFORM set_config('test.apps_returning_rbac_key', v_limited_key, false);

  INSERT INTO public.apps (
    owner_org,
    app_id,
    icon_url,
    name,
    retention,
    default_upload_channel
  )
  VALUES (
    v_org_id,
    current_setting('test.apps_returning_rbac_blocked_app_id'),
    '',
    'RBAC blocked app',
    2592000,
    'dev'
  );

  INSERT INTO public.apikeys (
    user_id,
    key,
    mode,
    name,
    limited_to_orgs,
    limited_to_apps
  )
  VALUES (
    tests.get_supabase_uid('test_user'),
    v_limited_key,
    'all',
    'RBAC apps returning limited key',
    ARRAY[v_org_id]::uuid [],
    ARRAY[current_setting('test.apps_returning_rbac_allowed_app_id')]::character varying []
  );
END $$;

SELECT tests.authenticate_as('test_user');

SELECT lives_ok(
    $sql$
    INSERT INTO public.apps (
      owner_org,
      app_id,
      icon_url,
      name,
      retention,
      default_upload_channel
    )
    VALUES (
      current_setting('test.apps_returning_rbac_org_id')::uuid,
      current_setting('test.apps_returning_rbac_allowed_app_id'),
      '',
      'RBAC insert returning',
      2592000,
      'dev'
    )
    RETURNING app_id
  $sql$,
    'RBAC org super admin can create an app with INSERT ... RETURNING'
);

SELECT is(
    (
        SELECT count(*)
        FROM public.apps
        WHERE
            app_id = current_setting('test.apps_returning_rbac_allowed_app_id')
    ),
    1::bigint,
    'Inserted RBAC app is visible in the same authenticated session'
);

SELECT tests.clear_authentication();

DO $$
BEGIN
  PERFORM set_config(
    'request.headers',
    json_build_object(
      'capgkey',
      current_setting('test.apps_returning_rbac_key')
    )::text,
    true
  );
END $$;

SELECT is(
    (
        SELECT count(*)
        FROM public.apps
        WHERE
            owner_org = current_setting('test.apps_returning_rbac_org_id')::uuid
    ),
    1::bigint,
    'App-limited API key only sees the allowed app'
);

SELECT is(
    (
        SELECT min(app_id)
        FROM public.apps
        WHERE
            owner_org = current_setting('test.apps_returning_rbac_org_id')::uuid
    ),
    current_setting('test.apps_returning_rbac_allowed_app_id'),
    'App-limited API key does not gain org-wide app visibility'
);

SELECT * FROM finish();

ROLLBACK;
