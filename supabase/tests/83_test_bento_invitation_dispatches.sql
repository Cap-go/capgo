BEGIN;
SELECT plan(30);

SELECT has_table(
    'public',
    'bento_event_dispatches',
    'Bento dispatches have one private ledger'
);
SELECT has_index(
    'public',
    'bento_event_dispatches',
    'bento_event_dispatches_due_idx',
    'due work has an event and partition index'
);
SELECT has_index(
    'public',
    'bento_event_dispatches',
    'bento_event_dispatches_last_attempt_idx',
    'rolling budget has a timestamp index'
);
SELECT ok((
    SELECT relrowsecurity FROM pg_catalog.pg_class
    WHERE oid = 'public.bento_event_dispatches'::regclass
), 'ledger has RLS enabled');
SELECT is(pg_catalog.has_table_privilege(
    'anon',
    'public.bento_event_dispatches',
    'SELECT,INSERT,UPDATE,DELETE'
),
false,
'anonymous callers cannot access dispatches');
SELECT is(pg_catalog.has_table_privilege(
    'authenticated',
    'public.bento_event_dispatches',
    'SELECT,INSERT,UPDATE,DELETE'
),
false,
'users cannot access dispatches');
SELECT ok(pg_catalog.has_table_privilege(
    'service_role',
    'public.bento_event_dispatches',
    'SELECT,INSERT,UPDATE,DELETE'
),
'service role can maintain dispatches');
SELECT is(pg_catalog.has_function_privilege(
    'anon',
    'public.enroll_bento_invitation_reminders()',
    'EXECUTE'
),
false,
'anonymous callers cannot run enrollment');
SELECT is(pg_catalog.has_function_privilege(
    'authenticated',
    'public.enroll_bento_invitation_reminders()',
    'EXECUTE'
),
false,
'users cannot run enrollment');
SELECT ok(pg_catalog.has_function_privilege(
    'service_role',
    'public.enroll_bento_invitation_reminders()',
    'EXECUTE'
),
'service role can run enrollment');
SELECT ok((
    SELECT prosecdef AND proconfig @> ARRAY['search_path=""']
    FROM pg_catalog.pg_proc
    WHERE oid = 'public.enroll_bento_invitation_reminders()'::regprocedure
), 'enrollment has definer security and empty search path');
SELECT is((
    SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
    WHERE oid = 'public.enroll_bento_invitation_reminders()'::regprocedure
), 'postgres', 'enrollment has explicit postgres ownership');

SELECT tests.create_supabase_user(
    'bento_dispatch_actor',
    'bento-dispatch-actor@example.com'
);
SELECT tests.create_supabase_user(
    'bento_dispatch_target',
    'bento-dispatch-target@example.com'
);
SET LOCAL "request.jwt.claim.role" = 'service_role';
INSERT INTO public.users (id, email) VALUES
(
    tests.get_supabase_uid('bento_dispatch_actor'),
    'bento-dispatch-actor@example.com'
),
(
    tests.get_supabase_uid('bento_dispatch_target'),
    'bento-dispatch-target@example.com'
);
INSERT INTO public.orgs (id, created_by, name, management_email) VALUES
(
    '83000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('bento_dispatch_actor'),
    'Bento invitation test',
    'bento-dispatch-org@example.com'
);

INSERT INTO public.tmp_users (
    id,
    email,
    org_id,
    first_name,
    last_name,
    invite_magic_string,
    created_at,
    updated_at
) VALUES
(
    830001,
    'Bento-Dispatch-New@example.com',
    '83000000-0000-4000-8000-000000000001',
    'New',
    'Recipient',
    'bento-dispatch-new-token',
    current_timestamp,
    current_timestamp
),
(
    830002,
    'bento-dispatch-late@example.com',
    '83000000-0000-4000-8000-000000000001',
    'Late',
    'Recipient',
    'bento-dispatch-late-token',
    current_timestamp - interval '6 days',
    current_timestamp - interval '6 days'
),
(
    830003,
    'bento-dispatch-expired@example.com',
    '83000000-0000-4000-8000-000000000001',
    'Expired',
    'Recipient',
    'bento-dispatch-expired-token',
    current_timestamp - interval '8 days',
    current_timestamp - interval '8 days'
);
INSERT INTO public.org_users (
    id, org_id, user_id, is_invite, rbac_role_name
) VALUES
(
    830001,
    '83000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('bento_dispatch_target'),
    true,
    'org_member'
);

CREATE TEMP TABLE bento_test_generations AS
SELECT
    id,
    tmp_user_id,
    org_user_id
FROM public.org_invitation_email_requests
WHERE tmp_user_id IN (830001, 830002, 830003) OR org_user_id = 830001;

SELECT is((
    SELECT count(*) FROM public.bento_event_dispatches
    WHERE
        context_key IN (
            SELECT bento_test_generations.id::text FROM bento_test_generations
        )
), 0::bigint, 'queued initial emails do not enroll reminders');
UPDATE public.org_invitation_email_requests SET sent_at = current_timestamp
WHERE id IN (SELECT bento_test_generations.id FROM bento_test_generations);
SELECT is((
    SELECT count(*) FROM public.bento_event_dispatches
    WHERE context_key = (
        SELECT bento_test_generations.id::text FROM bento_test_generations
        WHERE bento_test_generations.tmp_user_id = 830001
    )
), 2::bigint, 'accepted new-user initial email enrolls two stages');
SELECT is((
    SELECT count(*) FROM public.bento_event_dispatches
    WHERE context_key = (
        SELECT bento_test_generations.id::text FROM bento_test_generations
        WHERE bento_test_generations.org_user_id = 830001
    )
), 2::bigint, 'accepted existing-user initial email enrolls two stages');
SELECT is((
    SELECT count(*) FROM public.bento_event_dispatches
    WHERE context_key = (
        SELECT bento_test_generations.id::text FROM bento_test_generations
        WHERE bento_test_generations.tmp_user_id = 830003
    )
), 0::bigint, 'expired invitations do not enroll');
SELECT ok((
    SELECT
        bool_and(
            recipient_key = 'email:bento-dispatch-new@example.com'
            AND email = 'bento-dispatch-new@example.com'
            AND partition = 830001 % 5
        )
    FROM public.bento_event_dispatches
    WHERE context_key = (
        SELECT bento_test_generations.id::text FROM bento_test_generations
        WHERE bento_test_generations.tmp_user_id = 830001
    )
), 'temporary recipient identity and partition are stable');
SELECT ok((
    SELECT
        bool_and(
            recipient_key = 'user:'
            || tests.get_supabase_uid('bento_dispatch_target')::text
        )
    FROM public.bento_event_dispatches
    WHERE context_key = (
        SELECT bento_test_generations.id::text FROM bento_test_generations
        WHERE bento_test_generations.org_user_id = 830001
    )
), 'existing-user recipient identity uses user UUID');
SELECT is((
    SELECT due_at FROM public.bento_event_dispatches
    WHERE context_key = (
        SELECT bento_test_generations.id::text FROM bento_test_generations
        WHERE bento_test_generations.tmp_user_id = 830001
    ) AND tag = 'org:invite_new_user_reminder_1'
), current_timestamp + interval '2 days',
'new-user first stage is two days after acceptance');
SELECT is((
    SELECT due_at FROM public.bento_event_dispatches
    WHERE context_key = (
        SELECT bento_test_generations.id::text FROM bento_test_generations
        WHERE bento_test_generations.tmp_user_id = 830001
    ) AND tag = 'org:invite_new_user_reminder_2'
), current_timestamp + interval '7 days' - interval '1 hour',
'new-user final stage precedes token expiry by one hour');
SELECT is((
    SELECT due_at FROM public.bento_event_dispatches
    WHERE context_key = (
        SELECT bento_test_generations.id::text FROM bento_test_generations
        WHERE bento_test_generations.tmp_user_id = 830002
    ) AND tag = 'org:invite_new_user_reminder_2'
), current_timestamp + interval '1 day' - interval '1 hour',
'late initial acceptance uses current token lifetime');
SELECT is((
    SELECT due_at FROM public.bento_event_dispatches
    WHERE context_key = (
        SELECT bento_test_generations.id::text FROM bento_test_generations
        WHERE bento_test_generations.org_user_id = 830001
    ) AND tag = 'org:invite_existing_user_reminder_2'
), current_timestamp + interval '7 days',
'existing-user second stage is seven days after acceptance');
UPDATE public.org_invitation_email_requests SET
    sent_at = current_timestamp + interval '1 hour'
WHERE id IN (SELECT bento_test_generations.id FROM bento_test_generations);
SELECT is((
    SELECT count(*) FROM public.bento_event_dispatches
    WHERE
        context_key IN (
            SELECT bento_test_generations.id::text FROM bento_test_generations
        )
), 6::bigint, 'repeated sent marker updates do not duplicate enrollment');

SELECT throws_ok(
    $$
INSERT INTO public.bento_event_dispatches (tag, recipient_key, context_key, email, due_at, partition, attempt_count) VALUES ('test', 'email:fake@example.com', 'fake', 'fake@example.com', CURRENT_TIMESTAMP, 0, 6)
$$,
    '23514',
    null,
    'attempts cannot exceed five'
);
SELECT throws_ok(
    $$
INSERT INTO public.bento_event_dispatches (tag, recipient_key, context_key, email, due_at, partition) VALUES ('test', 'email:fake@example.com', 'fake', 'fake@example.com', CURRENT_TIMESTAMP, 5)
$$,
    '23514',
    null,
    'partitions cannot exceed four'
);
SELECT throws_ok(
    $$
INSERT INTO public.bento_event_dispatches (tag, recipient_key, context_key, email, due_at, partition) SELECT tag, recipient_key, context_key, email, due_at, partition FROM public.bento_event_dispatches WHERE context_key = (SELECT bento_test_generations.id::text FROM bento_test_generations WHERE tmp_user_id = 830001) LIMIT 1
$$,
    '23505',
    null,
    'event recipient context identity is unique'
);
SELECT ok(NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE
        table_schema = 'public'
        AND table_name = 'bento_event_dispatches'
        AND column_name IN ('invite_magic_string', 'invite_link', 'token')
), 'ledger stores no invitation token or link');
SELECT ok((
    SELECT count(*) = 1 FROM pg_catalog.pg_trigger
    WHERE
        tgrelid = 'public.org_invitation_email_requests'::regclass
        AND tgname = 'enroll_bento_invitation_reminders'
), 'one acceptance trigger enrolls the reminders');
SELECT ok(NOT EXISTS (
    SELECT 1 FROM public.cron_tasks
    WHERE name LIKE '%bento%dispatch%'
), 'dispatching introduces no Supabase cron task');
SELECT ok((
    SELECT
        bool_and(
            attempt_count = 0
            AND claim_token IS null
            AND accepted_at IS null
            AND cancelled_at IS null
        )
    FROM public.bento_event_dispatches
    WHERE
        context_key IN (
            SELECT bento_test_generations.id::text FROM bento_test_generations
        )
), 'enrollment starts unclaimed and unaccepted');

SELECT * FROM finish(); -- noqa: AM04
ROLLBACK;
