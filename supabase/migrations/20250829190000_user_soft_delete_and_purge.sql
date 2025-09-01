-- User soft-delete: immediate access removal and scheduled purge
-- 1) Prefix email and ban user immediately
-- 2) Schedule full purge after 30 days via daily cron

-- Add deletion request timestamp on public.users if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'delete_requested_at'
  ) THEN
    EXECUTE 'ALTER TABLE public.users ADD COLUMN delete_requested_at timestamptz';
  END IF;
END $$;

-- Replace delete_user() to perform soft-delete and schedule purge
CREATE OR REPLACE FUNCTION public.delete_user() RETURNS void LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_hashed_email text;
  v_new_email text;
  v_req_id text;
BEGIN
  -- Identify current user
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_user: auth.uid() returned NULL';
  END IF;

  -- Fetch current email
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'delete_user: auth.users row not found for %', v_user_id;
  END IF;

  -- Record hashed email for audit
  v_hashed_email := encode(extensions.digest(v_user_email::bytea, 'sha256'::text)::bytea, 'hex'::text);
  INSERT INTO public.deleted_account (email) VALUES (v_hashed_email);

  -- Before changing emails, notify triggers to tag the original email in Bento
  PERFORM net.http_post(
    url := public.get_db_url() || '/functions/v1/triggers/on_user_soft_delete',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apisecret', public.get_apikey()
    ),
    body := jsonb_build_object('user_id', v_user_id, 'email', v_user_email),
    timeout_milliseconds := 15000
  );

  -- Build a unique tombstone email so the original can be reused later
  -- Format: deleted+<uid>+<original>
  v_new_email := 'deleted+' || v_user_id::text || '+' || v_user_email;

  -- Immediately prevent access on auth side and free the original email
  UPDATE auth.users
  SET
    email = v_new_email,
    banned_until = NOW() + interval '100 years'
  WHERE id = v_user_id;

  -- Mirror on public profile to stop transactional emails
  UPDATE public.users
  SET
    email = v_new_email,
    billing_email = NULL,
    "optForNewsletters" = false,
    "enableNotifications" = false,
    ban_time = NOW() + interval '100 years',
    delete_requested_at = NOW()
  WHERE id = v_user_id;

  -- Note: We do NOT delete now. Purge happens via cron after 30 days.
END;
$$;

ALTER FUNCTION public.delete_user() OWNER TO postgres;

-- Purge function: permanently delete users after 30 days
CREATE OR REPLACE FUNCTION public.purge_deleted_users() RETURNS void LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  rec RECORD;
BEGIN
  -- Iterate over users scheduled for purge
  FOR rec IN
    SELECT id
    FROM public.users
    WHERE delete_requested_at IS NOT NULL
      AND delete_requested_at < NOW() - interval '30 days'
  LOOP
    -- 1) Delete orgs owned by the user (cascades apps/versions; triggers enqueue async cleanups)
    DELETE FROM public.orgs WHERE created_by = rec.id;

    -- 2) Optional: proactively remove user memberships and keys (otherwise will cascade)
    DELETE FROM public.org_users WHERE user_id = rec.id;
    DELETE FROM public.apikeys WHERE user_id = rec.id;

    -- 3) Delete public profile first to fire on_user_delete (enqueue-only) quickly
    DELETE FROM public.users WHERE id = rec.id;

    -- 4) Remove auth user last
    DELETE FROM auth.users WHERE id = rec.id;
  END LOOP;
END;
$$;

ALTER FUNCTION public.purge_deleted_users() OWNER TO postgres;

-- Schedule daily purge job (idempotent)
DO $$
BEGIN
  PERFORM 1
  FROM cron.job
  WHERE jobname = 'purge_deleted_users_daily';

  IF NOT FOUND THEN
    PERFORM cron.schedule(
      'purge_deleted_users_daily',
      '0 1 * * *', -- every day at 01:00
      'SELECT public.purge_deleted_users();'
    );
  END IF;
END $$;
