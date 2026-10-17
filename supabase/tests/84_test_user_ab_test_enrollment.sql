BEGIN;
SELECT plan(1);

-- Exercise the production trigger on an isolated row shape so this test neither
-- changes shared users nor depends on auth provisioning or outbound queues.
CREATE TEMP TABLE ab_test_guard_probe (
  id integer PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  created_via_invite boolean DEFAULT false NOT NULL,
  onboarding jsonb DEFAULT '{}'::jsonb
);
CREATE TRIGGER protect_ab_test_probe
BEFORE INSERT OR UPDATE OF onboarding, created_at, created_via_invite ON ab_test_guard_probe
FOR EACH ROW EXECUTE FUNCTION public.protect_users_ab_test_state();
GRANT SELECT, INSERT, UPDATE ON ab_test_guard_probe TO authenticated, anon, service_role;

INSERT INTO ab_test_guard_probe (id, created_at, created_via_invite, onboarding) VALUES (
  1, '2026-01-01T00:00:00Z', true,
  '{"abtests":{"example":{"branch":"B","assigned_at":"2026-01-01T00:00:00Z"}},"abtests_enrolled":["example"],"abtests_bento_sync":{"pending":false},"intent":"ota"}'
);

SET LOCAL ROLE authenticated;
UPDATE ab_test_guard_probe SET
  created_at = '2030-01-01T00:00:00Z',
  created_via_invite = false,
  onboarding = '{"abtests":{"example":{"branch":"A"}},"abtests_enrolled":["forged"],"abtests_bento_sync":{"pending":true},"intent":"builder"}'
WHERE id = 1;
DO $$
BEGIN
  IF (SELECT onboarding->'abtests_enrolled' FROM pg_temp.ab_test_guard_probe WHERE id = 1) IS DISTINCT FROM '["example"]'::jsonb
    OR (SELECT onboarding #>> '{abtests,example,branch}' FROM pg_temp.ab_test_guard_probe WHERE id = 1) IS DISTINCT FROM 'B'
    OR (SELECT onboarding #>> '{abtests_bento_sync,pending}' FROM pg_temp.ab_test_guard_probe WHERE id = 1) IS DISTINCT FROM 'false'
    OR (SELECT created_at FROM pg_temp.ab_test_guard_probe WHERE id = 1) IS DISTINCT FROM '2026-01-01T00:00:00Z'::timestamptz
    OR (SELECT created_via_invite FROM pg_temp.ab_test_guard_probe WHERE id = 1) IS DISTINCT FROM true
    OR (SELECT onboarding->>'intent' FROM pg_temp.ab_test_guard_probe WHERE id = 1) IS DISTINCT FROM 'builder' THEN
    RAISE EXCEPTION 'Client edits must preserve backend experiment state, creation time and signup provenance while allowing intent changes';
  END IF;
END $$;

UPDATE ab_test_guard_probe SET onboarding = '{}' WHERE id = 1;
INSERT INTO ab_test_guard_probe (id, created_at, created_via_invite, onboarding)
VALUES (2, '2030-01-01T00:00:00Z', true, '{"abtests":{},"abtests_enrolled":["forged"],"abtests_bento_sync":{"pending":true},"intent":"ota"}');
UPDATE ab_test_guard_probe SET created_via_invite = false WHERE id = 1;
UPDATE ab_test_guard_probe SET created_via_invite = true WHERE id = 2;
INSERT INTO ab_test_guard_probe (id, created_via_invite) VALUES (1, false)
ON CONFLICT (id) DO UPDATE SET created_via_invite = EXCLUDED.created_via_invite;
DO $$
BEGIN
  IF NOT (SELECT onboarding ?& ARRAY['abtests', 'abtests_enrolled', 'abtests_bento_sync'] FROM pg_temp.ab_test_guard_probe WHERE id = 1)
    OR (SELECT onboarding ?| ARRAY['abtests', 'abtests_enrolled', 'abtests_bento_sync'] FROM pg_temp.ab_test_guard_probe WHERE id = 2)
    OR (SELECT created_at > now() FROM pg_temp.ab_test_guard_probe WHERE id = 2) THEN
    RAISE EXCEPTION 'Clients cannot erase existing state or insert experiment state and future creation times';
  END IF;
  IF (SELECT created_via_invite FROM pg_temp.ab_test_guard_probe WHERE id = 1) IS DISTINCT FROM true
    OR (SELECT created_via_invite FROM pg_temp.ab_test_guard_probe WHERE id = 2) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Client inserts must remain normal self-signups; updates and upserts cannot change existing invitation provenance';
  END IF;
END $$;
RESET ROLE;

-- Invoker identity must survive a user-facing SECURITY DEFINER wrapper.
CREATE FUNCTION pg_temp.try_change_ab_state() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE pg_temp.ab_test_guard_probe SET onboarding = '{"abtests_enrolled":["forged"]}', created_via_invite = false WHERE id = 1;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.try_change_ab_state() TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.try_change_ab_state();
RESET ROLE;

-- Also exercise JWT contexts used by wrappers that do not retain SET ROLE.
SET LOCAL request.jwt.claim.role = 'authenticated';
UPDATE ab_test_guard_probe SET created_via_invite = false WHERE id = 1;
SET LOCAL request.jwt.claim.role = '';
SET LOCAL request.jwt.claims = '{"role":"anon"}';
UPDATE ab_test_guard_probe SET created_via_invite = false WHERE id = 1;
SET LOCAL request.jwt.claims = '';
SET LOCAL ROLE anon;
UPDATE ab_test_guard_probe SET onboarding = '{"abtests_enrolled":["forged"]}', created_via_invite = false WHERE id = 1;
INSERT INTO ab_test_guard_probe (id, onboarding) VALUES (3, '{"abtests_enrolled":["forged"]}');
RESET ROLE;
DO $$
BEGIN
  IF (SELECT onboarding->'abtests_enrolled' FROM pg_temp.ab_test_guard_probe WHERE id = 1) IS DISTINCT FROM '["example"]'::jsonb
    OR (SELECT onboarding ? 'abtests_enrolled' FROM pg_temp.ab_test_guard_probe WHERE id = 3)
    OR (SELECT created_via_invite FROM pg_temp.ab_test_guard_probe WHERE id = 1) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Role and JWT contexts must preserve protection through definer wrappers';
  END IF;
END $$;

SET LOCAL ROLE service_role;
UPDATE ab_test_guard_probe SET onboarding = '{"abtests_enrolled":["backend"],"abtests":{"example":{"branch":"A"}}}', created_via_invite = false WHERE id = 1;
INSERT INTO ab_test_guard_probe (id, created_via_invite, onboarding) VALUES (4, true, '{"abtests_enrolled":["backend"]}');
RESET ROLE;
DO $$
BEGIN
  IF (SELECT onboarding->'abtests_enrolled' FROM pg_temp.ab_test_guard_probe WHERE id = 1) IS DISTINCT FROM '["backend"]'::jsonb
    OR (SELECT onboarding->'abtests_enrolled' FROM pg_temp.ab_test_guard_probe WHERE id = 4) IS DISTINCT FROM '["backend"]'::jsonb
    OR (SELECT created_via_invite FROM pg_temp.ab_test_guard_probe WHERE id = 1) IS DISTINCT FROM false
    OR (SELECT created_via_invite FROM pg_temp.ab_test_guard_probe WHERE id = 4) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'True backend writes must retain insert/update access';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.users'::regclass AND tgname = 'protect_users_ab_test_state' AND pg_catalog.pg_get_triggerdef(oid) LIKE '%created_via_invite%') THEN
    RAISE EXCEPTION 'The protection must be installed on the real users table';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'public.protect_users_ab_test_state()', 'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated', 'public.protect_users_ab_test_state()', 'EXECUTE') THEN
    RAISE EXCEPTION 'The trigger function must not become a public RPC';
  END IF;
END $$;

SELECT pass('A/B state and signup provenance are protected across insert, update, upsert, erase, roles and definer wrappers');
SELECT * FROM finish();
ROLLBACK;
