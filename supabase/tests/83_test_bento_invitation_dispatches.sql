BEGIN;
SELECT plan(25);
SELECT has_table(
    'public',
    'bento_event_dispatches',
    'private event ledger exists'
);
SELECT has_table(
    'public',
    'bento_evaluation_runs',
    'private evaluation state exists'
);
SELECT has_index(
    'public',
    'bento_event_dispatches',
    'bento_event_dispatches_active_idx',
    'active facts avoid historical scans'
);
SELECT has_index(
    'public',
    'bento_event_dispatches',
    'bento_event_dispatches_last_attempt_idx',
    'rolling provider budget is indexed'
);
SELECT has_index(
    'public',
    'bento_event_dispatches',
    'bento_event_dispatches_pending_audit_idx',
    'event audit relay is indexed'
);
SELECT has_index(
    'public',
    'bento_evaluation_runs',
    'bento_evaluation_runs_evaluation_key_key',
    'evaluation state has an indexed unique key'
);
SELECT has_index(
    'public',
    'bento_evaluation_runs',
    'bento_evaluation_runs_pending_audit_idx',
    'run audit relay is indexed'
);
SELECT ok((
    SELECT relrowsecurity FROM pg_catalog.pg_class
    WHERE oid = 'public.bento_event_dispatches'::regclass
), 'event RLS enabled');
SELECT ok((
    SELECT relrowsecurity FROM pg_catalog.pg_class
    WHERE oid = 'public.bento_evaluation_runs'::regclass
), 'run RLS enabled');
SELECT is(
    pg_catalog.has_table_privilege(
        'anon',
        'public.bento_event_dispatches',
        'SELECT,INSERT,UPDATE,DELETE'
    ),
    false,
    'anonymous cannot access events'
);
SELECT is(
    pg_catalog.has_table_privilege(
        'authenticated',
        'public.bento_event_dispatches',
        'SELECT,INSERT,UPDATE,DELETE'
    ),
    false,
    'users cannot access events'
);
SELECT is(
    pg_catalog.has_table_privilege(
        'anon',
        'public.bento_evaluation_runs',
        'SELECT,INSERT,UPDATE,DELETE'
    ),
    false,
    'anonymous cannot access runs'
);
SELECT is(
    pg_catalog.has_table_privilege(
        'authenticated',
        'public.bento_evaluation_runs',
        'SELECT,INSERT,UPDATE,DELETE'
    ),
    false,
    'users cannot access runs'
);
SELECT ok(
    pg_catalog.has_table_privilege(
        'service_role',
        'public.bento_event_dispatches',
        'SELECT,INSERT,UPDATE,DELETE'
    ),
    'service can maintain events'
);
SELECT ok(
    pg_catalog.has_table_privilege(
        'service_role',
        'public.bento_evaluation_runs',
        'SELECT,INSERT,UPDATE,DELETE'
    ),
    'service can maintain runs'
);
SELECT hasnt_column(
    'public',
    'bento_event_dispatches',
    'due_at',
    'no scheduled recipient dates'
);
SELECT hasnt_column(
    'public',
    'bento_event_dispatches',
    'partition',
    'no recipient divisions'
);
SELECT ok(NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'enroll_bento_invitation_reminders'
), 'no reminder enrollment trigger');
INSERT INTO public.bento_event_dispatches (
    flow_key, context_key, recipient_key, email, tag, status
)
VALUES (
    'test:pgtap',
    'test-context',
    'email:recipient@example.com',
    'recipient@example.com',
    'test:reminder',
    'failed'
);
SELECT throws_ok(
    $$UPDATE public.bento_event_dispatches
        SET attempt_count = 6
        WHERE flow_key = 'test:pgtap'$$,
    '23514',
    null,
    'event attempts never exceed five'
);
INSERT INTO public.bento_evaluation_runs (
    evaluation_key, scheduled_for
) VALUES ('test:pgtap', current_timestamp);
SELECT throws_ok(
    $$INSERT INTO public.bento_evaluation_runs
         (evaluation_key,
    scheduled_for)
        VALUES ('test:pgtap',
    CURRENT_TIMESTAMP)$$,
    '23505',
    null,
    'unfinished evaluation is unique'
);
SELECT throws_ok(
    $$UPDATE public.bento_evaluation_runs
        SET execution_attempt_count = 6
        WHERE evaluation_key = 'test:pgtap'$$,
    '23514',
    null,
    'execution attempts never exceed five'
);
SELECT throws_ok(
    $$UPDATE public.bento_evaluation_runs
        SET enqueue_attempt_count = 6
        WHERE evaluation_key = 'test:pgtap'$$,
    '23514',
    null,
    'publication attempts never exceed five'
);
UPDATE public.bento_evaluation_runs
SET status = 'completed'
WHERE evaluation_key = 'test:pgtap';
SELECT throws_ok(
    $$INSERT INTO public.bento_evaluation_runs
        (evaluation_key, scheduled_for)
      VALUES ('test:pgtap', CURRENT_TIMESTAMP)$$,
    '23505',
    null,
    'completed evaluation also remains unique'
);
SELECT lives_ok(
    $$UPDATE public.bento_evaluation_runs
      SET id = pg_catalog.gen_random_uuid(), status = 'pending_enqueue',
          scheduled_for = CURRENT_TIMESTAMP + INTERVAL '1 minute'
      WHERE evaluation_key = 'test:pgtap'$$,
    'next execution reuses the existing evaluation row'
);
SELECT is(
    (
        SELECT count(*)::int FROM public.bento_evaluation_runs
        WHERE evaluation_key = 'test:pgtap'
    ),
    1,
    'row reuse does not accumulate evaluation history'
);
SELECT * FROM finish(); -- noqa: AM04
ROLLBACK;
