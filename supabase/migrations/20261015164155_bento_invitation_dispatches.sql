-- Internal console invitation work only: one trigger call per initial-email
-- provider acceptance. Source lookups use request, invitation, user, and org
-- keys, so enrollment never scans production invitation or membership tables.
-- Worker claims use the partial (tag, partition, due_at, id) index and LIMIT 5;
-- eligibility starts from one ledger id and the current request generation.
-- No public RPC, plugin path, extension, backfill, or DB cron is added.

CREATE TABLE public.bento_event_dispatches (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    tag text NOT NULL,
    recipient_key text NOT NULL,
    context_key text NOT NULL,
    email text NOT NULL,
    due_at timestamptz NOT NULL,
    partition smallint NOT NULL CHECK (partition BETWEEN 0 AND 4),
    attempt_count smallint NOT NULL DEFAULT 0 CHECK (
        attempt_count BETWEEN 0 AND 5
    ),
    last_attempt_at timestamptz,
    claim_token uuid,
    claim_until timestamptz,
    accepted_at timestamptz,
    cancelled_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT bento_event_dispatches_event_unique
    UNIQUE (tag, recipient_key, context_key)
);

ALTER TABLE public.bento_event_dispatches OWNER TO postgres;
ALTER TABLE public.bento_event_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bento_event_dispatches FROM public,
anon,
authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bento_event_dispatches
TO service_role;

CREATE POLICY deny_user_bento_event_dispatches
ON public.bento_event_dispatches
AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);

CREATE INDEX bento_event_dispatches_due_idx
ON public.bento_event_dispatches (tag, partition, due_at, id)
WHERE accepted_at IS null AND cancelled_at IS null AND attempt_count < 5;

CREATE INDEX bento_event_dispatches_last_attempt_idx
ON public.bento_event_dispatches (last_attempt_at)
WHERE last_attempt_at IS NOT null;

COMMENT ON TABLE public.bento_event_dispatches IS
'Private generic Bento event ledger. Acceptance means provider acceptance, not
inbox delivery. Invitation context_key is the initial-email generation UUID;
invitation tokens and URLs are resolved fresh and never stored in this table.';

CREATE FUNCTION public.enroll_bento_invitation_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_email text;
    v_user_id uuid;
    v_token_at timestamptz;
    v_tag_prefix text;
    v_recipient_key text;
    v_second_due_at timestamptz;
    v_partition smallint;
BEGIN
    IF NEW.tmp_user_id IS NOT NULL THEN
        SELECT t.email, GREATEST(t.updated_at, t.created_at)
        INTO v_email, v_token_at
        FROM public.tmp_users AS t
        JOIN public.orgs AS o ON o.id = t.org_id
        WHERE t.id = NEW.tmp_user_id
            AND t.cancelled_at IS NULL
            AND GREATEST(t.updated_at, t.created_at) > CURRENT_TIMESTAMP - INTERVAL '7 days';
        IF NOT FOUND THEN
            RETURN NEW;
        END IF;
        v_tag_prefix := 'org:invite_new_user_reminder_';
        v_recipient_key := 'email:' || pg_catalog.lower(v_email);
        v_second_due_at := LEAST(
            NEW.sent_at + INTERVAL '7 days',
            v_token_at + INTERVAL '7 days' - INTERVAL '1 hour'
        );
        v_partition := ((NEW.tmp_user_id % 5 + 5) % 5)::smallint;
    ELSE
        SELECT u.id, u.email INTO v_user_id, v_email
        FROM public.org_users AS ou
        JOIN public.users AS u ON u.id = ou.user_id
        JOIN public.orgs AS o ON o.id = ou.org_id
        WHERE ou.id = NEW.org_user_id
            AND ou.is_invite AND ou.app_id IS NULL AND ou.channel_id IS NULL;
        IF NOT FOUND THEN
            RETURN NEW;
        END IF;
        v_tag_prefix := 'org:invite_existing_user_reminder_';
        v_recipient_key := 'user:' || v_user_id::text;
        v_second_due_at := NEW.sent_at + INTERVAL '7 days';
        v_partition := ((NEW.org_user_id % 5 + 5) % 5)::smallint;
    END IF;

    INSERT INTO public.bento_event_dispatches (
        tag, recipient_key, context_key, email, due_at, partition
    ) VALUES
        (v_tag_prefix || '1', v_recipient_key, NEW.id::text,
            pg_catalog.lower(v_email), NEW.sent_at + INTERVAL '2 days', v_partition),
        (v_tag_prefix || '2', v_recipient_key, NEW.id::text,
            pg_catalog.lower(v_email), v_second_due_at, v_partition)
    ON CONFLICT (tag, recipient_key, context_key) DO NOTHING;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.enroll_bento_invitation_reminders() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enroll_bento_invitation_reminders()
FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_bento_invitation_reminders()
TO service_role;

CREATE TRIGGER enroll_bento_invitation_reminders
AFTER UPDATE OF sent_at ON public.org_invitation_email_requests
FOR EACH ROW WHEN (old.sent_at IS null AND new.sent_at IS NOT null)
EXECUTE FUNCTION public.enroll_bento_invitation_reminders();
