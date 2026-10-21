-- Invitation reminders move into one Bento flow. Capgo now sends a single
-- org:invite_sent event per delivered invitation and keeps the subscriber's
-- capgo_open_invites field equal to the invitations still open for them; the
-- Bento flow owns the reminder timing and checks that field before each
-- reminder. The Cloudflare evaluation dispatcher and its ledger are removed.
--
-- Execution model: field syncs are queued once per invitation close (accept,
-- cancel, rescind, removal) on the existing send_email queue. Each trigger
-- probe is a unique-FK lookup on org_invitation_email_requests; the sender
-- reads open invitations by org_users.user_id (finx_org_users_user_id) or by
-- tmp_users.email (tmp_users_email_idx below). No cron task or queue is added.

DROP TABLE IF EXISTS public.bento_evaluation_runs;
DROP TABLE IF EXISTS public.bento_event_dispatches;

ALTER TABLE public.org_invitation_email_requests
ADD COLUMN bento_synced_at timestamptz;

COMMENT ON COLUMN public.org_invitation_email_requests.bento_synced_at IS
'When Bento accepted org:invite_sent for this generation. Reset on resend so
the new generation starts its own reminder flow.';

CREATE INDEX tmp_users_email_idx ON public.tmp_users (email);

CREATE OR REPLACE FUNCTION public.queue_org_invitation_email(
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
            message_id = NULL,
            bento_synced_at = NULL
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
            message_id = NULL,
            bento_synced_at = NULL
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

CREATE FUNCTION public.trigger_queue_org_invitation_bento_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_recipient jsonb;
BEGIN
    -- Only invitations Bento already knows about need their field rewritten;
    -- this avoids creating Bento subscribers for never-delivered invitations.
    -- BEFORE DELETE runs ahead of the request row's ON DELETE CASCADE.
    IF TG_TABLE_NAME = 'tmp_users' THEN
        PERFORM 1 FROM public.org_invitation_email_requests AS request
        WHERE request.tmp_user_id = OLD.id AND request.bento_synced_at IS NOT NULL;
        IF FOUND THEN
            v_recipient := pg_catalog.jsonb_build_object('kind', 'new', 'email', OLD.email);
        END IF;
    ELSIF TG_TABLE_NAME = 'org_users' THEN
        PERFORM 1 FROM public.org_invitation_email_requests AS request
        WHERE request.org_user_id = OLD.id AND request.bento_synced_at IS NOT NULL;
        IF FOUND THEN
            v_recipient := pg_catalog.jsonb_build_object('kind', 'existing', 'user_id', OLD.user_id);
        END IF;
    END IF;

    IF v_recipient IS NOT NULL THEN
        PERFORM pgmq.send(
            'send_email',
            pg_catalog.jsonb_build_object(
                'function_name', 'send_email',
                'function_type', 'cloudflare',
                'payload', pg_catalog.jsonb_build_object('org_invitation_bento_sync', v_recipient)
            )
        );
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.trigger_queue_org_invitation_bento_sync() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trigger_queue_org_invitation_bento_sync() FROM public,
anon,
authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_queue_org_invitation_bento_sync()
TO service_role;

-- New-user invitations close when accepted (row deleted), rescinded
-- (cancelled_at set) or removed with their organization.
CREATE TRIGGER queue_tmp_user_invitation_bento_delete
BEFORE DELETE ON public.tmp_users
FOR EACH ROW
EXECUTE FUNCTION public.trigger_queue_org_invitation_bento_sync();

CREATE TRIGGER queue_tmp_user_invitation_bento_cancel
AFTER UPDATE OF cancelled_at ON public.tmp_users
FOR EACH ROW
WHEN (old.cancelled_at IS null AND new.cancelled_at IS NOT null)
EXECUTE FUNCTION public.trigger_queue_org_invitation_bento_sync();

-- Existing-user invitations close when accepted (is_invite cleared) or
-- removed (row deleted).
CREATE TRIGGER queue_org_user_invitation_bento_delete
BEFORE DELETE ON public.org_users
FOR EACH ROW
WHEN (old.is_invite)
EXECUTE FUNCTION public.trigger_queue_org_invitation_bento_sync();

CREATE TRIGGER queue_org_user_invitation_bento_accept
AFTER UPDATE OF is_invite ON public.org_users
FOR EACH ROW
WHEN (old.is_invite AND NOT new.is_invite)
EXECUTE FUNCTION public.trigger_queue_org_invitation_bento_sync();
