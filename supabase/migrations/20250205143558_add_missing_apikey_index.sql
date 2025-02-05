DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'apikeys' AND indexname = 'finx_apikeys_user_id') THEN
    CREATE INDEX finx_apikeys_user_id ON public.apikeys USING btree (user_id);
  END IF;
END
$$;
