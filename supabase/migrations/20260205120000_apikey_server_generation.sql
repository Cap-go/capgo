ALTER TABLE public.apikeys
  ALTER COLUMN key DROP DEFAULT;

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
CREATE TRIGGER apikeys_strip_plain_key_for_hashed
AFTER INSERT OR UPDATE ON public.apikeys
FOR EACH ROW
EXECUTE FUNCTION public.apikeys_strip_plain_key_for_hashed();
