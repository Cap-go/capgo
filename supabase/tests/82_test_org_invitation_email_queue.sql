SET default_transaction_isolation = 'repeatable read';
BEGIN;

SELECT plan(55);

SELECT has_table(
    'public',
    'org_invitation_email_requests',
    'organization invitation email requests have private durable state'
);

SELECT has_function(
    'public',
    'queue_org_invitation_email',
    ARRAY['text', 'bigint', 'uuid'],
    'organization invitation email enqueue helper exists'
);

SELECT ok(
    (
        SELECT relrowsecurity FROM pg_catalog.pg_class
        WHERE oid = 'public.org_invitation_email_requests'::regclass
    ),
    'email request state has row-level security enabled'
);

SELECT is(
    pg_catalog.has_function_privilege(
        'anon', 'public.queue_org_invitation_email(text,bigint,uuid)', 'EXECUTE'
    ), false, 'anonymous callers cannot enqueue invitation emails'
);
SELECT is(
    pg_catalog.has_function_privilege(
        'authenticated',
        'public.queue_org_invitation_email(text,bigint,uuid)',
        'EXECUTE'
    ), false, 'authenticated callers cannot enqueue invitation emails directly'
);
SELECT ok(
    pg_catalog.has_function_privilege(
        'service_role',
        'public.queue_org_invitation_email(text,bigint,uuid)',
        'EXECUTE'
    ), 'the internal service role can enqueue invitation emails'
);
SELECT is(
    pg_catalog.has_table_privilege(
        'anon',
        'public.org_invitation_email_requests',
        'SELECT,INSERT,UPDATE,DELETE'
    ), false, 'anonymous callers have no email request table privileges'
);
SELECT is(
    pg_catalog.has_table_privilege(
        'authenticated',
        'public.org_invitation_email_requests',
        'SELECT,INSERT,UPDATE,DELETE'
    ), false, 'authenticated callers have no email request table privileges'
);
SELECT ok(
    pg_catalog.has_table_privilege(
        'service_role',
        'public.org_invitation_email_requests',
        'SELECT,INSERT,UPDATE,DELETE'
    ), 'the internal service role can maintain email requests'
);
SELECT ok(
    (
        SELECT prosecdef AND proconfig @> ARRAY['search_path=""']
        FROM pg_catalog.pg_proc
        WHERE
            oid
            = pg_catalog.to_regprocedure(
                'public.queue_org_invitation_email(text,bigint,uuid)'
            )
    ),
    'the enqueue helper has definer security and an empty search path'
);
SELECT is(
    (
        SELECT pg_catalog.pg_get_userbyid(proowner)
        FROM pg_catalog.pg_proc
        WHERE
            oid
            = pg_catalog.to_regprocedure(
                'public.queue_org_invitation_email(text,bigint,uuid)'
            )
    ),
    'postgres', 'the enqueue helper has an explicit trusted owner'
);

CREATE FUNCTION pg_temp.invitation_email_messages(p_generation uuid)
RETURNS SETOF jsonb
LANGUAGE sql
SET search_path = ''
AS $$
    SELECT message FROM pgmq.q_send_email
    WHERE message -> 'payload' ->> 'org_invitation_id' = p_generation::text;
$$;

SELECT tests.create_supabase_user(
    'invite_email_actor', 'invite-email-actor@example.com'
);
SELECT tests.create_supabase_user(
    'invite_email_target', 'invite-email-target@example.com'
);
SET LOCAL "request.jwt.claim.role" = 'service_role';

INSERT INTO public.users (id, email)
VALUES
(
    tests.get_supabase_uid('invite_email_actor'),
    'invite-email-actor@example.com'
),
(
    tests.get_supabase_uid('invite_email_target'),
    'invite-email-target@example.com'
);

INSERT INTO public.orgs (id, created_by, name, management_email)
VALUES (
    '82000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('invite_email_actor'),
    'Invitation email queue test', 'invite-email-org@example.com'
);

INSERT INTO public.apps (app_id, icon_url, user_id, name, owner_org)
VALUES (
    'com.test.invitation-email-queue',
    '',
    tests.get_supabase_uid('invite_email_actor'),
    'Invitation email scope test', '82000000-0000-4000-8000-000000000001'
);

SELECT pg_catalog.set_config(
    'request.jwt.claim.sub',
    tests.get_supabase_uid('invite_email_actor')::text,
    true
);
INSERT INTO public.org_users (id, org_id, user_id, rbac_role_name, is_invite)
VALUES (
    820001, '82000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('invite_email_target'),
    public.rbac_role_org_member(),
    true
);

INSERT INTO public.tmp_users (
    id,
    email,
    org_id,
    first_name,
    last_name,
    invite_magic_string,
    invited_by_user_id
)
VALUES (
    820001,
    'invite-email-new@example.com',
    '82000000-0000-4000-8000-000000000001',
    'Invitation', 'Recipient', 'invite-email-initial-token',
    tests.get_supabase_uid('invite_email_actor')
);

CREATE TEMP TABLE invitation_email_generations AS
SELECT
    id AS generation,
    org_user_id,
    tmp_user_id
FROM public.org_invitation_email_requests
WHERE org_user_id = 820001 OR tmp_user_id = 820001;

SELECT is(
    (
        SELECT count(*) FROM public.org_invitation_email_requests
        WHERE org_user_id = 820001
    ),
    1::bigint, 'an existing-user pending invite creates one request'
);
SELECT is(
    (
        SELECT count(*) FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 820001
    ),
    1::bigint, 'a new-user pending invite creates one request'
);
SELECT is(
    (SELECT count(*) FROM pg_temp.invitation_email_messages(
        (
            SELECT generation FROM invitation_email_generations
            WHERE org_user_id = 820001
        )
    )), 1::bigint, 'the existing-user invite is queued exactly once'
);
SELECT is(
    (SELECT count(*) FROM pg_temp.invitation_email_messages(
        (
            SELECT generation FROM invitation_email_generations
            WHERE tmp_user_id = 820001
        )
    )), 1::bigint, 'the new-user invite is queued exactly once'
);
SELECT is(
    (SELECT message FROM pg_temp.invitation_email_messages(
        (
            SELECT generation FROM invitation_email_generations
            WHERE org_user_id = 820001
        )
    ) AS message),
    (SELECT pg_catalog.jsonb_build_object(
        'function_name', 'send_email', 'function_type', 'cloudflare',
        'payload',
        pg_catalog.jsonb_build_object('org_invitation_id', generation)
    ) FROM invitation_email_generations
    WHERE org_user_id = 820001),
    'existing-user queue payload contains only its generation UUID'
);
SELECT is(
    (SELECT message FROM pg_temp.invitation_email_messages(
        (
            SELECT generation FROM invitation_email_generations
            WHERE tmp_user_id = 820001
        )
    ) AS message),
    (SELECT pg_catalog.jsonb_build_object(
        'function_name', 'send_email', 'function_type', 'cloudflare',
        'payload',
        pg_catalog.jsonb_build_object('org_invitation_id', generation)
    ) FROM invitation_email_generations
    WHERE tmp_user_id = 820001),
    'new-user queue payload contains only its generation UUID'
);
SELECT is(
    (
        SELECT invited_by_user_id FROM public.org_invitation_email_requests
        WHERE org_user_id = 820001
    ),
    tests.get_supabase_uid('invite_email_actor'),
    'existing-user initial email captures the authenticated inviter'
);
SELECT is(
    (
        SELECT invited_by_user_id FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 820001
    ),
    tests.get_supabase_uid('invite_email_actor'),
    'new-user initial email captures the durable inviter'
);

INSERT INTO public.org_users (
    id, org_id, user_id, rbac_role_name, is_invite, app_id
)
VALUES
(
    820002,
    '82000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('invite_email_actor'),
    public.rbac_role_org_member(), false, null
),
(
    820003,
    '82000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('invite_email_target'),
    public.rbac_role_app_developer(), true, 'com.test.invitation-email-queue'
);
SELECT is(
    (
        SELECT count(*) FROM public.org_invitation_email_requests
        WHERE org_user_id IN (820002, 820003)
    ),
    0::bigint,
    'ordinary members and app-scoped invites do not create email requests'
);
SELECT is(
    public.queue_org_invitation_email('existing', 820003), 'NOT_PENDING',
    'the helper rejects app-scoped invites'
);
SELECT is(
    public.queue_org_invitation_email('existing', 820002), 'NOT_PENDING',
    'the helper rejects ordinary memberships'
);
SELECT is(
    public.queue_org_invitation_email('existing', 820001), 'COOLDOWN',
    'existing-user duplicate requests respect cooldown'
);
SELECT is(
    public.queue_org_invitation_email('new', 820001), 'COOLDOWN',
    'new-user duplicate requests respect cooldown'
);
SELECT is(
    (
        SELECT count(*) FROM pgmq.q_send_email
        WHERE
            message -> 'payload' ->> 'org_invitation_id' IN
            (
                SELECT saved.generation::text
                FROM invitation_email_generations AS saved
            )
    ),
    2::bigint, 'cooldown does not enqueue duplicate jobs'
);

UPDATE public.org_users SET rbac_role_name = public.rbac_role_org_admin()
WHERE id = 820001;
UPDATE public.tmp_users SET
    first_name = 'Updated', rbac_role_name = public.rbac_role_org_admin()
WHERE id = 820001;
UPDATE public.tmp_users SET invite_magic_string = invite_magic_string
WHERE id = 820001;
SELECT is(
    (
        SELECT id FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 820001
    ),
    (
        SELECT generation FROM invitation_email_generations
        WHERE tmp_user_id = 820001
    ),
    'role, name, and unchanged token updates retain the email generation'
);
SELECT is(
    (
        SELECT count(*) FROM pgmq.q_send_email
        WHERE
            message -> 'payload' ->> 'org_invitation_id' IN
            (
                SELECT saved.generation::text
                FROM invitation_email_generations AS saved
            )
    ),
    2::bigint, 'role, name, and unchanged token updates do not enqueue'
);
SELECT throws_ok(
    $$UPDATE public.tmp_users SET invite_magic_string = 'invite-email-too-soon'
      WHERE id = 820001$$,
    'P0001',
    'INVITE_EMAIL_COOLDOWN',
    'a token rotation during cooldown fails transactionally'
);
SELECT is(
    (
        SELECT invite_magic_string FROM public.tmp_users
        WHERE id = 820001
    ),
    'invite-email-initial-token',
    'a rejected resend retains the previous usable token'
);

UPDATE public.org_invitation_email_requests
SET
    requested_at = pg_catalog.clock_timestamp() - interval '5 minutes',
    sent_at = pg_catalog.now(), message_id = 'invite-email-test-message'
WHERE tmp_user_id = 820001;
UPDATE public.tmp_users
SET
    invite_magic_string = 'invite-email-rotated-token',
    invited_by_user_id = null
WHERE id = 820001;
SELECT ok(
    (
        SELECT id FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 820001
    )
    <> (
        SELECT generation FROM invitation_email_generations
        WHERE tmp_user_id = 820001
    ),
    'a token rotation at the cooldown boundary creates a fresh generation'
);
SELECT is(
    (
        SELECT count(*) FROM public.org_invitation_email_requests
        WHERE
            id = (
                SELECT saved.generation
                FROM invitation_email_generations AS saved
                WHERE saved.tmp_user_id = 820001
            )
    ),
    0::bigint, 'stale generations are missing from current sender state'
);
SELECT is(
    (SELECT count(*) FROM pg_temp.invitation_email_messages(
        (
            SELECT id FROM public.org_invitation_email_requests
            WHERE tmp_user_id = 820001
        )
    )), 1::bigint, 'the refreshed generation is queued exactly once'
);
SELECT ok(
    (
        SELECT
            sent_at IS null
            AND message_id IS null
            AND invited_by_user_id IS null
        FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 820001
    ),
    'a resend clears delivery state and refreshes nullable inviter attribution'
);

UPDATE public.org_invitation_email_requests
SET requested_at = pg_catalog.clock_timestamp() - interval '5 minutes'
WHERE org_user_id = 820001;
SELECT is(
    public.queue_org_invitation_email(
        'existing', 820001, tests.get_supabase_uid('invite_email_actor')
    ),
    'QUEUED', 'an explicit existing-user resend queues after cooldown'
);
SELECT is(
    (
        SELECT count(*) FROM public.org_invitation_email_requests
        WHERE org_user_id = 820001
    ),
    1::bigint, 'resends update one mutable invitation request'
);
SELECT ok(
    (
        SELECT id FROM public.org_invitation_email_requests
        WHERE org_user_id = 820001
    )
    <> (
        SELECT generation FROM invitation_email_generations
        WHERE org_user_id = 820001
    ),
    'existing-user resends invalidate the previous generation'
);

CREATE TEMP TABLE invitation_email_checkpoint AS
SELECT count(*) AS jobs FROM pgmq.q_send_email;
UPDATE public.org_users SET is_invite = false
WHERE id = 820001;
UPDATE public.tmp_users SET cancelled_at = pg_catalog.now()
WHERE id = 820001;
UPDATE public.tmp_users SET invite_magic_string = 'invite-email-cancelled-token'
WHERE id = 820001;
SELECT is(
    public.queue_org_invitation_email('existing', 820001), 'NOT_PENDING',
    'accepted existing-user invites are skipped'
);
SELECT is(
    public.queue_org_invitation_email('new', 820001), 'NOT_PENDING',
    'cancelled new-user invites are skipped'
);
SELECT is(
    (SELECT count(*) FROM pgmq.q_send_email),
    (SELECT jobs FROM invitation_email_checkpoint),
    'acceptance and cancellation never enqueue email jobs'
);
INSERT INTO public.tmp_users (
    id, email, org_id, first_name, last_name, invite_magic_string, cancelled_at
)
VALUES (
    820002,
    'invite-email-cancelled@example.com',
    '82000000-0000-4000-8000-000000000001',
    'Cancelled', 'Recipient', 'invite-email-cancelled-insert', pg_catalog.now()
);
SELECT is(
    (
        SELECT count(*) FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 820002
    ),
    0::bigint, 'an already-cancelled invite does not create an email request'
);
SELECT is(
    public.queue_org_invitation_email('new', 9223372036854775807),
    'NOT_PENDING',
    'out-of-range or missing new-user invites are skipped'
);
SELECT is(
    public.queue_org_invitation_email('existing', -1), 'NOT_PENDING',
    'missing existing-user invites are skipped'
);
SELECT is(
    public.queue_org_invitation_email('unknown', 820001), 'NOT_PENDING',
    'unknown invitation kinds are skipped'
);

CREATE FUNCTION pg_temp.rollback_invitation_email()
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    INSERT INTO public.tmp_users (
        id, email, org_id, first_name, last_name, invite_magic_string
    ) VALUES (
        820003, 'invite-email-rollback@example.com',
        '82000000-0000-4000-8000-000000000001',
        'Rollback', 'Recipient', 'invite-email-rollback-token'
    );
    RAISE EXCEPTION 'INVITATION_TEST_ROLLBACK';
END;
$$;
SELECT throws_ok(
    $$SELECT pg_temp.rollback_invitation_email()$$,
    'P0001', 'INVITATION_TEST_ROLLBACK',
    'a later transaction failure rolls back the invitation and email job'
);
SELECT is(
    (
        SELECT count(*) FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 820003
    ),
    0::bigint, 'rolled-back invitation writes leave no delivery state'
);
SELECT is(
    (SELECT count(*) FROM pgmq.q_send_email),
    (SELECT jobs FROM invitation_email_checkpoint),
    'rolled-back invitation writes leave no email job'
);

CREATE FUNCTION pg_temp.reject_invitation_email_job()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    RAISE EXCEPTION 'INVITATION_TEST_QUEUE_FAILURE';
END;
$$;
CREATE TRIGGER test_reject_invitation_email_job
BEFORE INSERT ON pgmq.q_send_email
FOR EACH ROW WHEN (new.message -> 'payload' ? 'org_invitation_id')
EXECUTE FUNCTION pg_temp.reject_invitation_email_job();
SELECT throws_ok(
    $$INSERT INTO public.tmp_users (
        id, email, org_id, first_name, last_name, invite_magic_string
      )
      VALUES (820004, 'invite-email-failed-queue@example.com',
              '82000000-0000-4000-8000-000000000001',
              'Queue', 'Failure', 'invite-email-failed-queue-token')$$,
    'P0001',
    'INVITATION_TEST_QUEUE_FAILURE',
    'initial enqueue failures propagate to the invitation write'
);
DROP TRIGGER test_reject_invitation_email_job ON pgmq.q_send_email;
SELECT is(
    (
        SELECT count(*) FROM public.tmp_users
        WHERE id = 820004
    ),
    0::bigint, 'failed initial enqueue leaves no invite without a durable email'
);
SELECT is(
    (
        SELECT count(*) FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 820004
    ),
    0::bigint, 'failed initial enqueue rolls back request state'
);

SELECT throws_ok(
    $$INSERT INTO public.org_invitation_email_requests (
        org_user_id, tmp_user_id
      )
      VALUES (820001, 820001)$$,
    '23514', null, 'email state cannot reference both invitation kinds'
);
SELECT throws_ok(
    $$INSERT INTO public.org_invitation_email_requests DEFAULT VALUES$$,
    '23514', null, 'email state must reference one invitation'
);
DELETE FROM public.tmp_users
WHERE id = 820001;
SELECT is(
    (
        SELECT count(*) FROM public.org_invitation_email_requests
        WHERE tmp_user_id = 820001
    ),
    0::bigint, 'deleting a temporary invitation cascades its delivery state'
);
DELETE FROM public.org_users
WHERE id = 820001;
SELECT is(
    (
        SELECT count(*) FROM public.org_invitation_email_requests
        WHERE org_user_id = 820001
    ),
    0::bigint,
    'deleting an existing-user invitation cascades its delivery state'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1 FROM pgmq.list_queues()
        WHERE queue_name LIKE '%org_invitation%'
    ),
    'invitation mail uses the existing send_email queue'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1 FROM public.cron_tasks
        WHERE name LIKE '%org_invitation%'
    ),
    'invitation mail introduces no dedicated cron task'
);

SELECT tests.clear_authentication();
SELECT * FROM finish(); -- noqa: AM04
ROLLBACK;
RESET default_transaction_isolation;
