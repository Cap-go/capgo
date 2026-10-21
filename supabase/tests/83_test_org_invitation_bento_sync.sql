SET default_transaction_isolation = 'repeatable read';
BEGIN;

SELECT plan(20);

SELECT hasnt_table(
    'public', 'bento_event_dispatches',
    'the Bento dispatch ledger is removed'
);
SELECT hasnt_table(
    'public', 'bento_evaluation_runs',
    'the Bento evaluation run table is removed'
);
SELECT has_column(
    'public', 'org_invitation_email_requests', 'bento_synced_at',
    'invitation requests record when Bento accepted org:invite_sent'
);
SELECT has_index(
    'public', 'tmp_users', 'tmp_users_email_idx',
    'open new-user invitations are looked up by email through an index'
);
SELECT ok(
    (
        SELECT prosecdef AND proconfig @> ARRAY['search_path=""']
        FROM pg_catalog.pg_proc
        WHERE
            oid
            = 'public.trigger_queue_org_invitation_bento_sync()'::regprocedure
    ),
    'the Bento sync trigger has definer security and an empty search path'
);
SELECT is(
    pg_catalog.has_function_privilege(
        'authenticated',
        'public.trigger_queue_org_invitation_bento_sync()',
        'EXECUTE'
    ), false, 'authenticated callers cannot run the Bento sync trigger function'
);

CREATE FUNCTION pg_temp.bento_syncs(p_recipient jsonb)
RETURNS bigint
LANGUAGE sql
SET search_path = ''
AS $$
    SELECT count(*) FROM pgmq.q_send_email
    WHERE message -> 'payload' -> 'org_invitation_bento_sync' = p_recipient
      AND message ->> 'function_name' = 'send_email'
      AND message ->> 'function_type' = 'cloudflare';
$$;

SELECT
    tests.create_supabase_user('bento_sync_actor', 'bento-sync-actor@example.com');
SELECT
    tests.create_supabase_user('bento_sync_synced', 'bento-sync-synced@example.com');
SELECT
    tests.create_supabase_user('bento_sync_unsynced', 'bento-sync-unsynced@example.com');
SET LOCAL "request.jwt.claim.role" = 'service_role';

INSERT INTO public.users (id, email)
VALUES
(tests.get_supabase_uid('bento_sync_actor'), 'bento-sync-actor@example.com'),
(tests.get_supabase_uid('bento_sync_synced'), 'bento-sync-synced@example.com'),
(
    tests.get_supabase_uid('bento_sync_unsynced'),
    'bento-sync-unsynced@example.com'
);

INSERT INTO public.orgs (id, created_by, name, management_email)
VALUES (
    '83000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('bento_sync_actor'),
    'Invitation Bento sync test', 'bento-sync-org@example.com'
);

SELECT pg_catalog.set_config(
    'request.jwt.claim.sub',
    tests.get_supabase_uid('bento_sync_actor')::text,
    true
);
INSERT INTO public.org_users (id, org_id, user_id, rbac_role_name, is_invite)
VALUES
(
    830001, '83000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('bento_sync_synced'),
    public.rbac_role_org_member(),
    true
),
(
    830002, '83000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('bento_sync_unsynced'),
    public.rbac_role_org_member(),
    true
);

INSERT INTO public.tmp_users (
    id, email, org_id, first_name, last_name, invite_magic_string
)
VALUES
(
    830001,
    'bento-sync-rescind@example.com',
    '83000000-0000-4000-8000-000000000001',
    'Rescind',
    'Me',
    'bento-sync-token-1'
),
(
    830002,
    'bento-sync-accept@example.com',
    '83000000-0000-4000-8000-000000000001',
    'Accept',
    'Me',
    'bento-sync-token-2'
),
(
    830003,
    'bento-sync-unsent@example.com',
    '83000000-0000-4000-8000-000000000001',
    'Unsent',
    'Invite',
    'bento-sync-token-3'
),
(
    830004,
    'bento-sync-resend@example.com',
    '83000000-0000-4000-8000-000000000001',
    'Resend',
    'Me',
    'bento-sync-token-4'
);

-- Simulate delivered invitations that Bento already tracks.
UPDATE public.org_invitation_email_requests
SET sent_at = pg_catalog.now(), bento_synced_at = pg_catalog.now()
WHERE org_user_id = 830001 OR tmp_user_id IN (830001, 830002, 830004);

UPDATE public.org_users SET is_invite = false
WHERE id = 830001;
SELECT is(
    pg_temp.bento_syncs(pg_catalog.jsonb_build_object(
        'kind',
        'existing',
        'user_id',
        tests.get_supabase_uid('bento_sync_synced')
    )),
    1::bigint,
    'accepting a Bento-tracked existing-user invite queues one field sync'
);

DELETE FROM public.org_users
WHERE id = 830002;
SELECT is(
    pg_temp.bento_syncs(pg_catalog.jsonb_build_object(
        'kind',
        'existing',
        'user_id',
        tests.get_supabase_uid('bento_sync_unsynced')
    )),
    0::bigint, 'removing an invite Bento never saw queues no sync'
);

UPDATE public.tmp_users SET cancelled_at = pg_catalog.now()
WHERE id = 830001;
SELECT is(
    pg_temp.bento_syncs(
        '{"kind": "new", "email": "bento-sync-rescind@example.com"}'
    ),
    1::bigint,
    'rescinding a Bento-tracked new-user invite queues one field sync'
);
UPDATE public.tmp_users SET cancelled_at = pg_catalog.now()
WHERE id = 830001;
SELECT is(
    pg_temp.bento_syncs(
        '{"kind": "new", "email": "bento-sync-rescind@example.com"}'
    ),
    1::bigint, 'touching an already-cancelled invite queues nothing more'
);

DELETE FROM public.tmp_users
WHERE id = 830002;
SELECT is(
    pg_temp.bento_syncs(
        '{"kind": "new", "email": "bento-sync-accept@example.com"}'
    ),
    1::bigint,
    'deleting a Bento-tracked new-user invite (acceptance) queues one field sync'
);
SELECT is(
    (
        SELECT count(*) FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 830002
    ),
    0::bigint, 'the request row still cascades after the sync is queued'
);

DELETE FROM public.tmp_users
WHERE id = 830003;
SELECT is(
    pg_temp.bento_syncs(
        '{"kind": "new", "email": "bento-sync-unsent@example.com"}'
    ),
    0::bigint, 'deleting a never-delivered new-user invite queues no sync'
);

-- A resend starts a new generation, which must start its own Bento flow.
UPDATE public.org_invitation_email_requests
SET requested_at = pg_catalog.now() - interval '6 minutes'
WHERE tmp_user_id = 830004;
UPDATE public.tmp_users SET invite_magic_string = 'bento-sync-token-4-rotated'
WHERE id = 830004;
SELECT is(
    (
        SELECT bento_synced_at FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 830004
    ),
    null, 'a resend clears bento_synced_at for the new generation'
);
SELECT is(
    (
        SELECT sent_at FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 830004
    ),
    null, 'a resend clears sent_at for the new generation'
);
SELECT is(
    pg_temp.bento_syncs(
        '{"kind": "new", "email": "bento-sync-resend@example.com"}'
    ),
    0::bigint, 'a resend queues no close sync'
);

CREATE FUNCTION pg_temp.rollback_bento_close()
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    UPDATE public.org_invitation_email_requests
    SET bento_synced_at = pg_catalog.now()
    WHERE tmp_user_id = 830004;
    DELETE FROM public.tmp_users WHERE id = 830004;
    RAISE EXCEPTION 'BENTO_SYNC_TEST_ROLLBACK';
END;
$$;
SELECT throws_ok(
    $$SELECT pg_temp.rollback_bento_close()$$,
    'P0001', 'BENTO_SYNC_TEST_ROLLBACK',
    'a failed close rolls back'
);
SELECT is(
    pg_temp.bento_syncs(
        '{"kind": "new", "email": "bento-sync-resend@example.com"}'
    ),
    0::bigint, 'a rolled-back close leaves no sync job'
);
SELECT is(
    (
        SELECT count(*) FROM public.tmp_users
        WHERE id = 830004
    ),
    1::bigint, 'a rolled-back close keeps the invitation'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1 FROM pgmq.list_queues()
        WHERE queue_name LIKE '%bento%'
    ),
    'Bento sync uses the existing send_email queue'
);

SELECT tests.clear_authentication();
SELECT * FROM finish(); -- noqa: AM04
ROLLBACK;
RESET default_transaction_isolation;
