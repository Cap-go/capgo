BEGIN;

SELECT plan(13);

CREATE OR REPLACE FUNCTION test_metrics_oracle_access_control() RETURNS SETOF TEXT AS $$
DECLARE
    v_owner_user uuid;
    v_attacker_user uuid;
    v_org_id uuid;
    v_target_app_id text := 'com.oracle.metrics.guardian';
    v_missing_org uuid := '00000000-0000-0000-0000-000000000000';
    v_start_date date := DATE '2024-01-01';
    v_end_date date := DATE '2024-01-01';
    v_authorized_count bigint;
    v_unauthorized_count bigint;
BEGIN
    SELECT tests.create_supabase_user('test-metrics-oracle-owner') INTO v_owner_user;
    SELECT tests.create_supabase_user('test-metrics-oracle-attacker') INTO v_attacker_user;

    INSERT INTO public.users (id, email, created_at, updated_at)
    VALUES (v_owner_user, 'test-metrics-oracle-owner@local.test', NOW(), NOW());
    INSERT INTO public.users (id, email, created_at, updated_at)
    VALUES (v_attacker_user, 'test-metrics-oracle-attacker@local.test', NOW(), NOW());

    PERFORM tests.authenticate_as_service_role();

    INSERT INTO public.orgs (id, created_by, name, management_email)
    VALUES (gen_random_uuid(), v_owner_user, 'Oracle metrics test org', 'security-test@example.test')
    RETURNING id INTO v_org_id;

    INSERT INTO public.org_users (user_id, org_id, user_right)
    VALUES (v_owner_user, v_org_id, 'admin');

    INSERT INTO public.apps (app_id, icon_url, owner_org, user_id, name)
    VALUES (v_target_app_id, 'https://example.com/icon.png', v_org_id, v_owner_user, 'Oracle Metrics Fixture App');

    INSERT INTO public.daily_mau (app_id, date, mau)
    VALUES (v_target_app_id, v_start_date, 17);

    INSERT INTO public.daily_storage (app_id, date, storage)
    VALUES (v_target_app_id, v_start_date, 13);

    INSERT INTO public.daily_bandwidth (app_id, date, bandwidth)
    VALUES (v_target_app_id, v_start_date, 29);

    INSERT INTO public.daily_build_time (app_id, date, build_time_unit)
    VALUES (v_target_app_id, v_start_date, 2);

    INSERT INTO public.daily_version (date, app_id, version_name, get, fail, install, uninstall)
    VALUES (v_start_date, v_target_app_id, '1.0.0', 3, 0, 1, 0);

    PERFORM tests.authenticate_as('test-metrics-oracle-owner');

    SELECT COUNT(*) INTO v_authorized_count
    FROM public.get_app_metrics(v_org_id, v_start_date, v_end_date);
    RETURN NEXT is(
        v_authorized_count,
        1::bigint,
        'Authorized owner can query get_app_metrics for their org'
    );

    SELECT COUNT(*) INTO v_authorized_count
    FROM public.get_global_metrics(v_org_id, v_start_date, v_end_date);
    RETURN NEXT is(
        v_authorized_count,
        1::bigint,
        'Authorized owner can query get_global_metrics for their org'
    );

    PERFORM tests.authenticate_as('test-metrics-oracle-attacker');

    SELECT COUNT(*) INTO v_unauthorized_count
    FROM public.get_app_metrics(v_org_id, v_start_date, v_end_date);
    RETURN NEXT is(
        v_unauthorized_count,
        0::bigint,
        'Unauthorized app tenant cannot query get_app_metrics for target org'
    );

    SELECT COUNT(*) INTO v_unauthorized_count
    FROM public.get_app_metrics(v_missing_org, v_start_date, v_end_date);
    RETURN NEXT is(
        v_unauthorized_count,
        0::bigint,
        'Non-existent org returns empty set for get_app_metrics'
    );

    SELECT COUNT(*) INTO v_unauthorized_count
    FROM public.get_global_metrics(v_org_id, v_start_date, v_end_date);
    RETURN NEXT is(
        v_unauthorized_count,
        0::bigint,
        'Unauthorized app tenant cannot query get_global_metrics for target org'
    );

    SELECT COUNT(*) INTO v_unauthorized_count
    FROM public.get_global_metrics(v_missing_org, v_start_date, v_end_date);
    RETURN NEXT is(
        v_unauthorized_count,
        0::bigint,
        'Non-existent org returns empty set for get_global_metrics'
    );

    PERFORM tests.clear_authentication();

    SELECT COUNT(*) INTO v_unauthorized_count
    FROM public.get_app_metrics(v_org_id, v_start_date, v_end_date);
    RETURN NEXT is(
        v_unauthorized_count,
        0::bigint,
        'Missing role returns empty set for get_app_metrics'
    );

    SELECT COUNT(*) INTO v_unauthorized_count
    FROM public.get_global_metrics(v_org_id, v_start_date, v_end_date);
    RETURN NEXT is(
        v_unauthorized_count,
        0::bigint,
        'Missing role returns empty set for get_global_metrics'
    );

    PERFORM set_config('request.jwt.claim.org_id', v_org_id::text, true);
    SELECT COUNT(*) INTO v_unauthorized_count
    FROM public.get_total_metrics();
    RETURN NEXT is(
        v_unauthorized_count,
        0::bigint,
        'Missing role still returns empty set for get_total_metrics'
    );

    PERFORM set_config('request.jwt.claim.org_id', '', true);
    PERFORM set_config('request.jwt.claim.org_id', v_missing_org::text, true);
    SELECT COUNT(*) INTO v_unauthorized_count
    FROM public.get_total_metrics();
    RETURN NEXT is(
        v_unauthorized_count,
        0::bigint,
        'Unknown target org in JWT claim still returns empty set for get_total_metrics'
    );

    RETURN NEXT throws_ok(
        format(
            'SELECT * FROM public.get_total_metrics(%L, %L::date, %L::date)',
            v_org_id,
            v_start_date,
            v_end_date
        ),
        '42501',
        'permission denied for function get_total_metrics',
        'get_total_metrics(org_id,start_date,end_date) requires service role'
    );

    PERFORM tests.authenticate_as_service_role();

    SELECT COUNT(*) INTO v_authorized_count
    FROM public.get_total_metrics(v_org_id, v_start_date, v_end_date);
    RETURN NEXT is(
        v_authorized_count > 0,
        true,
        'Authenticated service role can still query explicit org_id overload in get_total_metrics'
    );
END;
$$ LANGUAGE plpgsql;

SELECT test_metrics_oracle_access_control();

SELECT * FROM finish();

ROLLBACK;
