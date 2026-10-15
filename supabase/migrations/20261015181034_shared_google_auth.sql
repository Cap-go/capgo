-- Server-only OAuth attempts and replay markers. Provider credentials are encrypted
-- with a domain-separated server key; client/verifier/state bindings are indexed.
CREATE TABLE public.google_auth_attempts (
  state_hash text PRIMARY KEY CHECK (length(state_hash) = 43),
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 32 AND 128),
  redirect_uri text NOT NULL CHECK (length(redirect_uri) <= 2048),
  code_challenge text NOT NULL CHECK (length(code_challenge) = 43),
  client_state text NOT NULL CHECK (length(client_state) BETWEEN 32 AND 128),
  expected_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  expected_subject text,
  registration_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(registration_metadata) = 'object'),
  provider_verifier text NOT NULL CHECK (length(provider_verifier) BETWEEN 43 AND 128),
  callback_claimed boolean NOT NULL DEFAULT false,
  exchange_hash text UNIQUE,
  credential text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);
ALTER TABLE public.google_auth_attempts OWNER TO postgres;
ALTER TABLE public.google_auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_auth_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_auth_attempts TO service_role;
CREATE POLICY google_auth_attempts_server ON public.google_auth_attempts TO service_role USING (true) WITH CHECK (true);
CREATE INDEX google_auth_attempts_expiry_idx ON public.google_auth_attempts (expires_at);
CREATE INDEX google_auth_attempts_user_idx ON public.google_auth_attempts (expected_user_id) WHERE expected_user_id IS NOT NULL;

CREATE TABLE public.google_auth_token_uses (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 43),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);
ALTER TABLE public.google_auth_token_uses OWNER TO postgres;
ALTER TABLE public.google_auth_token_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_auth_token_uses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.google_auth_token_uses TO service_role;
CREATE POLICY google_auth_token_uses_server ON public.google_auth_token_uses TO service_role USING (true) WITH CHECK (true);
CREATE INDEX google_auth_token_uses_expiry_idx ON public.google_auth_token_uses (expires_at);
