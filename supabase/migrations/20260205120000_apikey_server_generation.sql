ALTER TABLE public.apikeys
  ALTER COLUMN key SET DEFAULT gen_random_uuid()::text;

DO $$
BEGIN
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

REVOKE INSERT (key, key_hash) ON TABLE public.apikeys FROM anon;
REVOKE INSERT (key, key_hash) ON TABLE public.apikeys FROM authenticated;
REVOKE UPDATE (key, key_hash) ON TABLE public.apikeys FROM anon;
REVOKE UPDATE (key, key_hash) ON TABLE public.apikeys FROM authenticated;
GRANT INSERT (key, key_hash), UPDATE (key, key_hash) ON TABLE public.apikeys TO service_role;

CREATE OR REPLACE FUNCTION public.create_apikey_v2(
  p_name text,
  p_mode public.key_mode DEFAULT 'all',
  p_limited_to_orgs uuid[] DEFAULT '{}'::uuid[],
  p_limited_to_apps character varying[] DEFAULT '{}'::character varying[],
  p_expires_at timestamptz DEFAULT NULL,
  p_hashed boolean DEFAULT false
) RETURNS public.apikeys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_plain_key text;
  v_key_hash text;
  v_row public.apikeys;
BEGIN
  v_user_id := public.get_identity('{write,all}'::public.key_mode[]);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name_is_required';
  END IF;

  IF p_mode IS NULL THEN
    RAISE EXCEPTION 'mode_is_required';
  END IF;

  v_plain_key := gen_random_uuid()::text;
  IF p_hashed THEN
    v_key_hash := encode(extensions.digest(v_plain_key, 'sha256'), 'hex');
  END IF;

  INSERT INTO public.apikeys (
    user_id,
    key,
    key_hash,
    mode,
    name,
    limited_to_orgs,
    limited_to_apps,
    expires_at
  ) VALUES (
    v_user_id,
    CASE WHEN p_hashed THEN NULL ELSE v_plain_key END,
    CASE WHEN p_hashed THEN v_key_hash ELSE NULL END,
    p_mode,
    p_name,
    COALESCE(p_limited_to_orgs, '{}'::uuid[]),
    COALESCE(p_limited_to_apps, '{}'::character varying[]),
    p_expires_at
  )
  RETURNING * INTO v_row;

  IF p_hashed THEN
    v_row.key := v_plain_key;
  END IF;

  RETURN v_row;
END;
$$;

ALTER FUNCTION public.create_apikey_v2(
  p_name text,
  p_mode public.key_mode,
  p_limited_to_orgs uuid[],
  p_limited_to_apps character varying[],
  p_expires_at timestamptz,
  p_hashed boolean
) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.regenerate_apikey(
  p_apikey_id bigint
) RETURNS public.apikeys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_plain_key text;
  v_key_hash text;
  v_row public.apikeys;
  v_is_hashed boolean;
BEGIN
  v_user_id := public.get_identity('{write,all}'::public.key_mode[]);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_row
  FROM public.apikeys
  WHERE id = p_apikey_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'api_key_not_found';
  END IF;

  v_is_hashed := v_row.key IS NULL AND v_row.key_hash IS NOT NULL;
  v_plain_key := gen_random_uuid()::text;

  IF v_is_hashed THEN
    v_key_hash := encode(extensions.digest(v_plain_key, 'sha256'), 'hex');
    UPDATE public.apikeys
      SET key = NULL,
          key_hash = v_key_hash
      WHERE id = v_row.id
      RETURNING * INTO v_row;
    v_row.key := v_plain_key;
  ELSE
    UPDATE public.apikeys
      SET key = v_plain_key,
          key_hash = NULL
      WHERE id = v_row.id
      RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

ALTER FUNCTION public.regenerate_apikey(p_apikey_id bigint) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.create_apikey_v2(
  p_name text,
  p_mode public.key_mode,
  p_limited_to_orgs uuid[],
  p_limited_to_apps character varying[],
  p_expires_at timestamptz,
  p_hashed boolean
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.regenerate_apikey(p_apikey_id bigint) TO anon, authenticated, service_role;
