-- Organization invitation emails share the existing send_email queue and drain.
-- Execution model: one trigger call per qualifying invitation INSERT or token
-- rotation; explicit resends call the service-role-only helper once. This
-- is a console write path, never plugin traffic or an RLS permission helper.
-- Invitation tables may grow with all organizations; every lookup is bounded by
-- org_users_pkey/tmp_users_pkey and one unique invitation-FK index below. No
-- user/org/application scan or per-candidate permission check is introduced.
-- Sender lookup is by the generation primary key; deletion cascades use the
-- same unique FK indexes. Inviter deletion uses the partial FK index below.
-- No queue, cron task, extension, or retry budget is added or changed.

CREATE TABLE public.org_invitation_email_requests (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    org_user_id bigint UNIQUE REFERENCES public.org_users (
        id
    ) ON DELETE CASCADE,
    tmp_user_id integer UNIQUE REFERENCES public.tmp_users (
        id
    ) ON DELETE CASCADE,
    invited_by_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
    requested_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    sent_at timestamptz,
    message_id text,
    CONSTRAINT org_invitation_email_requests_one_invite
    CHECK (pg_catalog.num_nonnulls(org_user_id, tmp_user_id) = 1)
);

ALTER TABLE public.org_invitation_email_requests OWNER TO postgres;
ALTER TABLE public.org_invitation_email_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.org_invitation_email_requests FROM public,
anon,
authenticated;
GRANT SELECT,
INSERT,
UPDATE,
DELETE ON TABLE public.org_invitation_email_requests TO service_role;

CREATE POLICY deny_user_invitation_email_requests
ON public.org_invitation_email_requests
AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);

CREATE INDEX org_invitation_email_requests_inviter_idx
ON public.org_invitation_email_requests (invited_by_user_id)
WHERE invited_by_user_id IS NOT null;

COMMENT ON TABLE public.org_invitation_email_requests IS
'Internal invitation delivery state. Each invitation has one mutable row;
id is the current send generation, so old queued generations are skipped.';

CREATE FUNCTION public.queue_org_invitation_email(
    p_kind text,
    p_invite_id bigint,
    p_inviter_id uuid DEFAULT null
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_generation uuid;
BEGIN
    IF p_kind = 'existing' THEN
        PERFORM 1 FROM public.org_users AS invitation
        WHERE invitation.id = p_invite_id
            AND invitation.is_invite
            AND invitation.app_id IS NULL
            AND invitation.channel_id IS NULL;
        IF NOT FOUND THEN
            RETURN 'NOT_PENDING';
        END IF;

        INSERT INTO public.org_invitation_email_requests AS request (
            org_user_id, invited_by_user_id
        ) VALUES (p_invite_id, p_inviter_id)
        ON CONFLICT (org_user_id) DO UPDATE
        SET id = EXCLUDED.id,
            invited_by_user_id = EXCLUDED.invited_by_user_id,
            requested_at = pg_catalog.clock_timestamp(),
            sent_at = NULL,
            message_id = NULL
        WHERE request.requested_at <= pg_catalog.clock_timestamp() - interval '5 minutes'
        RETURNING id INTO v_generation;
    ELSIF p_kind = 'new' THEN
        PERFORM 1 FROM public.tmp_users AS invitation
        WHERE invitation.id = p_invite_id AND invitation.cancelled_at IS NULL;
        IF NOT FOUND THEN
            RETURN 'NOT_PENDING';
        END IF;

        INSERT INTO public.org_invitation_email_requests AS request (
            tmp_user_id, invited_by_user_id
        ) VALUES (p_invite_id, p_inviter_id)
        ON CONFLICT (tmp_user_id) DO UPDATE
        SET id = EXCLUDED.id,
            invited_by_user_id = EXCLUDED.invited_by_user_id,
            requested_at = pg_catalog.clock_timestamp(),
            sent_at = NULL,
            message_id = NULL
        WHERE request.requested_at <= pg_catalog.clock_timestamp() - interval '5 minutes'
        RETURNING id INTO v_generation;
    ELSE
        RETURN 'NOT_PENDING';
    END IF;

    -- ON CONFLICT locks the one state row before checking cooldown, including
    -- concurrent first requests. Update the row in place to match the sender's
    -- FOR UPDATE lock; never delete/reinsert delivery state. Invitation reads
    -- deliberately take no row lock: token rotation already holds that row,
    -- while the sender locks only state and reads the invitation afterward.
    IF v_generation IS NULL THEN
        RETURN 'COOLDOWN';
    END IF;

    -- Queue insertion and generation replacement commit together. Let enqueue
    -- failures abort the invitation write rather than silently losing email.
    PERFORM pgmq.send(
        'send_email',
        pg_catalog.jsonb_build_object(
            'function_name', 'send_email',
            'function_type', 'cloudflare',
            'payload', pg_catalog.jsonb_build_object('org_invitation_id', v_generation)
        )
    );
    RETURN 'QUEUED';
END;
$$;

ALTER FUNCTION public.queue_org_invitation_email(
    text, bigint, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.queue_org_invitation_email(
    text, bigint, uuid
) FROM public,
anon,
authenticated;
GRANT EXECUTE ON FUNCTION public.queue_org_invitation_email(
    text, bigint, uuid
) TO service_role;
COMMENT ON FUNCTION public.queue_org_invitation_email(text, bigint, uuid) IS
'Internal existing/new invitation email request. Returns QUEUED, COOLDOWN,
or NOT_PENDING; the state row serializes a five-minute cooldown.';

CREATE FUNCTION public.trigger_queue_org_invitation_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result text;
BEGIN
    IF TG_TABLE_NAME = 'org_users' THEN
        -- Service/API callers may have no auth.uid(). Keep unknown attribution
        -- NULL so the email sender can use its Capgo team fallback.
        PERFORM public.queue_org_invitation_email('existing', NEW.id, auth.uid());
    ELSIF TG_TABLE_NAME = 'tmp_users' THEN
        IF TG_OP = 'UPDATE' THEN
            IF NEW.invite_magic_string IS NOT DISTINCT FROM OLD.invite_magic_string THEN
                RETURN NEW;
            END IF;
        END IF;
        v_result := public.queue_org_invitation_email('new', NEW.id, NEW.invited_by_user_id);
        IF TG_OP = 'UPDATE' AND v_result = 'COOLDOWN' THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVITE_EMAIL_COOLDOWN';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.trigger_queue_org_invitation_email() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trigger_queue_org_invitation_email() FROM public,
anon,
authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_queue_org_invitation_email()
TO service_role;

CREATE TRIGGER queue_org_user_invitation_email
AFTER INSERT ON public.org_users
FOR EACH ROW
WHEN (new.is_invite AND new.app_id IS null AND new.channel_id IS null)
EXECUTE FUNCTION public.trigger_queue_org_invitation_email();

CREATE TRIGGER queue_tmp_user_invitation_email
AFTER INSERT OR UPDATE OF invite_magic_string ON public.tmp_users
FOR EACH ROW WHEN (new.cancelled_at IS null)
EXECUTE FUNCTION public.trigger_queue_org_invitation_email();
