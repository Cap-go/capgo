-- Regression tests for fail-fast PostgREST RLS behavior on large tables.
--
-- We assert that queries executed as role "anon" with no capgkey header
-- produce a plan with a One-Time Filter gate (no table scan work should run).

BEGIN;

SELECT plan(6);

-- Helper to capture EXPLAIN output as a single string.
CREATE OR REPLACE FUNCTION pg_temp.explain_text(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_line text;
  v_out text := '';
BEGIN
  FOR v_line IN EXECUTE 'EXPLAIN (FORMAT TEXT) ' || p_sql
  LOOP
    v_out := v_out || v_line || E'\n';
  END LOOP;
  RETURN v_out;
END;
$$;

-- Ensure request has no headers (simulates PostgREST anon key only).
DO $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
END $$;

-- Force RLS planning/execution as anon.
SET LOCAL ROLE anon;
SET LOCAL row_security = on;

-- Test 1: audit_logs query plan should be index-friendly and include the fail-fast guard.
WITH p AS (
  SELECT pg_temp.explain_text('SELECT id FROM public.audit_logs LIMIT 1') AS txt
)
SELECT ok(
  position('Index Cond' in (SELECT txt FROM p)) > 0
  AND position('audit_logs_allowed_orgs' in (SELECT txt FROM p)) > 0
  AND position('has_auth_or_valid_apikey' in (SELECT txt FROM p)) > 0
  AND position('Seq Scan' in (SELECT txt FROM p)) = 0,
  'audit_logs unauthed anon query is index-friendly and includes the guard'
);

-- Test 2: app_versions query plan should be index-friendly and include the fail-fast guard.
WITH p AS (
  SELECT pg_temp.explain_text('SELECT id FROM public.app_versions LIMIT 1') AS txt
)
SELECT ok(
  position('Index Cond' in (SELECT txt FROM p)) > 0
  AND position('allowed_read_apps' in (SELECT txt FROM p)) > 0
  AND position('has_auth_or_valid_apikey' in (SELECT txt FROM p)) > 0
  AND position('Seq Scan' in (SELECT txt FROM p)) = 0,
  'app_versions unauthed anon query is index-friendly and includes the guard'
);

-- Test 3: app_versions SELECT policy must not depend on per-row get_identity_org_appid()
SELECT ok(
  position(
    'get_identity_org_appid' in (
      SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'app_versions'
        AND p.polname = 'Allow for auth, api keys (read+)'
    )
  ) = 0,
  'app_versions SELECT policy avoids get_identity_org_appid()'
);

-- Test 4: app_versions SELECT policy should reference allowed_read_apps()
SELECT ok(
  position(
    'allowed_read_apps' in (
      SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'app_versions'
        AND p.polname = 'Allow for auth, api keys (read+)'
    )
  ) > 0,
  'app_versions SELECT policy uses allowed_read_apps()'
);

-- Test 5: audit_logs SELECT policy should reference audit_logs_allowed_orgs()
SELECT ok(
  position(
    'audit_logs_allowed_orgs' in (
      SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'audit_logs'
        AND p.polname = 'Allow select for auth, api keys (super_admin+)'
    )
  ) > 0,
  'audit_logs SELECT policy uses audit_logs_allowed_orgs()'
);

-- Test 6: audit_logs SELECT policy should reference has_auth_or_valid_apikey()
SELECT ok(
  position(
    'has_auth_or_valid_apikey' in (
      SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'audit_logs'
        AND p.polname = 'Allow select for auth, api keys (super_admin+)'
    )
  ) > 0,
  'audit_logs SELECT policy uses has_auth_or_valid_apikey() guard'
);

SELECT * FROM finish();

ROLLBACK;
