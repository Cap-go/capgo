CREATE TABLE IF NOT EXISTS public.compatibility_events (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id               uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  app_id               text NOT NULL REFERENCES public.apps(app_id) ON DELETE CASCADE,
  source               text NOT NULL,            -- default_channel_version_changed | default_channel_changed
  platform             text NOT NULL,            -- ios | android | electron
  channel_id           bigint,                   -- nullable snapshot; intentionally NO FK (event must survive channel deletion)
  channel_name         text NOT NULL,
  current_version_id   bigint,
  current_version_name text NOT NULL,
  previous_version_id  bigint,
  previous_version_name text NOT NULL,
  offenders            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz,
  resolved_by          uuid,
  resolution_kind      text,                     -- auto_compatible | accepted
  resolution_note      text
);

-- idempotent upsert target for the async handler
CREATE UNIQUE INDEX IF NOT EXISTS uq_compatibility_events_dedup
  ON public.compatibility_events (app_id, channel_id, platform, current_version_id, previous_version_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_compatibility_events_app_created
  ON public.compatibility_events (app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compatibility_events_unresolved
  ON public.compatibility_events (app_id) WHERE resolved_at IS NULL;

ALTER TABLE public.compatibility_events ENABLE ROW LEVEL SECURITY;

-- Read for users with RBAC app-read on this app; no INSERT/UPDATE policy => only
-- the service role (handler) and SECURITY DEFINER RPCs can write.
CREATE POLICY "compatibility_events_select" ON public.compatibility_events
  FOR SELECT TO authenticated
  USING ( public.rbac_check_permission(public.rbac_perm_app_read(), org_id, app_id, NULL::bigint) );

-- Explicit deny for every user-facing write (AGENTS.md RLS Rule 1.5: never rely
-- on implicit deny). Only the service-role handler (bypasses RLS) and the
-- SECURITY DEFINER accept RPC (runs as owner) may write; user-context roles
-- (incl. anon API-key traffic) must never INSERT/UPDATE/DELETE directly.
CREATE POLICY "compatibility_events_deny_insert" ON public.compatibility_events
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "compatibility_events_deny_update" ON public.compatibility_events
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "compatibility_events_deny_delete" ON public.compatibility_events
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

-- Manual accept: app.write, sets the resolution fields, requires a reason.
CREATE OR REPLACE FUNCTION public.acknowledge_compatibility_event(event_id bigint, note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_org uuid; v_app text;
BEGIN
  IF note IS NULL OR length(btrim(note)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  SELECT org_id, app_id INTO v_org, v_app
    FROM public.compatibility_events WHERE id = event_id;
  IF v_org IS NULL THEN RETURN; END IF;            -- unknown id: no-op
  -- RBAC: app upload-bundle permission (release managers); NOT legacy min_rights.
  -- Adjust the perm key in review if a different role should be allowed to accept.
  IF NOT public.rbac_check_permission_direct(
        public.rbac_perm_app_upload_bundle(), auth.uid(), v_org, v_app, NULL::bigint) THEN
    RETURN;                                         -- unauthorized: no-op (no oracle)
  END IF;
  UPDATE public.compatibility_events
    SET resolved_at = now(), resolved_by = auth.uid(),
        resolution_kind = 'accepted', resolution_note = note
    WHERE id = event_id AND resolved_at IS NULL;
END; $$;

ALTER FUNCTION public.acknowledge_compatibility_event(bigint, text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.acknowledge_compatibility_event(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_compatibility_event(bigint, text) TO authenticated;
