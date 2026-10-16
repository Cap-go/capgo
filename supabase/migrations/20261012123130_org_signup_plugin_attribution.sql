ALTER TABLE public.orgs
ADD COLUMN IF NOT EXISTS signup_plugin text;

COMMENT ON COLUMN public.orgs.signup_plugin IS
  'Plugin name from signup ref=plugin_<name> for SQL attribution. No PII.';
