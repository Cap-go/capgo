ALTER TABLE public.apikeys
  ALTER COLUMN key DROP DEFAULT;

DO $$
BEGIN
  UPDATE public.apikeys
    SET key = gen_random_uuid()::text
    WHERE key IS NULL AND key_hash IS NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'apikeys_key_or_hash'
  ) THEN
    ALTER TABLE public.apikeys
      ADD CONSTRAINT apikeys_key_or_hash
      CHECK (key IS NOT NULL OR key_hash IS NOT NULL);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.apikeys_force_server_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plain_key text;
  v_is_hashed boolean;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF current_setting('capgo.skip_apikey_trigger', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_realtime_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.key IS NOT DISTINCT FROM OLD.key AND NEW.key_hash IS NOT DISTINCT FROM OLD.key_hash THEN
      RETURN NEW;
    END IF;
    v_is_hashed := (OLD.key_hash IS NOT NULL AND OLD.key IS NULL) OR NEW.key_hash IS NOT NULL;
  ELSE
    v_is_hashed := NEW.key_hash IS NOT NULL;
  END IF;

  v_plain_key := gen_random_uuid()::text;

  IF v_is_hashed THEN
    NEW.key_hash := encode(extensions.digest(v_plain_key, 'sha256'), 'hex');
    NEW.key := v_plain_key;
  ELSE
    NEW.key := v_plain_key;
    NEW.key_hash := NULL;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.apikeys_force_server_key() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.apikeys_strip_plain_key_for_hashed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  IF current_setting('capgo.skip_apikey_trigger', true) = 'true' THEN
    RETURN NULL;
  END IF;

  IF NEW.key_hash IS NOT NULL AND NEW.key IS NOT NULL THEN
    UPDATE public.apikeys
      SET key = NULL
      WHERE id = NEW.id;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.apikeys_strip_plain_key_for_hashed() OWNER TO postgres;

DROP TRIGGER IF EXISTS apikeys_force_server_key ON public.apikeys;
CREATE TRIGGER apikeys_force_server_key
BEFORE INSERT OR UPDATE ON public.apikeys
FOR EACH ROW
EXECUTE FUNCTION public.apikeys_force_server_key();

DROP TRIGGER IF EXISTS apikeys_strip_plain_key_for_hashed ON public.apikeys;
CREATE CONSTRAINT TRIGGER apikeys_strip_plain_key_for_hashed
AFTER INSERT OR UPDATE ON public.apikeys
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.apikeys_strip_plain_key_for_hashed();

CREATE OR REPLACE FUNCTION public.create_hashed_apikey(
  p_user_id uuid,
  p_mode public.key_mode,
  p_name text,
  p_limited_to_orgs uuid[],
  p_limited_to_apps text[],
  p_expires_at timestamptz
)
RETURNS public.apikeys
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plain_key text;
  v_apikey public.apikeys;
BEGIN
  v_plain_key := gen_random_uuid()::text;

  PERFORM set_config('capgo.skip_apikey_trigger', 'true', true);

  INSERT INTO public.apikeys (
    user_id,
    key,
    key_hash,
    mode,
    name,
    limited_to_orgs,
    limited_to_apps,
    expires_at
  )
  VALUES (
    p_user_id,
    NULL,
    encode(extensions.digest(v_plain_key, 'sha256'), 'hex'),
    p_mode,
    p_name,
    COALESCE(p_limited_to_orgs, '{}'::uuid[]),
    COALESCE(p_limited_to_apps, '{}'::text[]),
    p_expires_at
  )
  RETURNING * INTO v_apikey;

  v_apikey.key := v_plain_key;

  RETURN v_apikey;
END;
$$;

CREATE OR REPLACE FUNCTION public.regenerate_hashed_apikey(
  p_apikey_id bigint,
  p_user_id uuid
)
RETURNS public.apikeys
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plain_key text;
  v_apikey public.apikeys;
BEGIN
  v_plain_key := gen_random_uuid()::text;

  PERFORM set_config('capgo.skip_apikey_trigger', 'true', true);

  UPDATE public.apikeys
    SET key = NULL,
        key_hash = encode(extensions.digest(v_plain_key, 'sha256'), 'hex')
    WHERE id = p_apikey_id
      AND user_id = p_user_id
    RETURNING * INTO v_apikey;

  v_apikey.key := v_plain_key;

  RETURN v_apikey;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_hashed_apikey(uuid, public.key_mode, text, uuid[], text[], timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_hashed_apikey(bigint, uuid) TO anon, authenticated;
