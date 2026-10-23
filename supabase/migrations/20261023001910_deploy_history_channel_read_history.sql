-- Honor channel.read_history on direct deploy_history reads.
--
-- The deploy_history SELECT policy only checks org membership, so an explicit
-- channel.read_history deny override on a channel did not hide that channel's
-- history from PostgREST reads. Follow the channels / channel_devices pattern
-- (channel_read_denied_channel_ids, channel_forced_devices_denied_channel_ids):
-- resolve the caller's explicit deny overrides once per statement and exclude
-- those channels.
--
-- This is a separate RESTRICTIVE policy so it composes with whatever permissive
-- membership policy is in place, instead of redefining it.

CREATE OR REPLACE FUNCTION "public"."channel_history_denied_channel_ids"() RETURNS bigint[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT public.rbac_denied_channel_ids_for_permission(public.rbac_perm_channel_read_history())
$$;

ALTER FUNCTION "public"."channel_history_denied_channel_ids"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."channel_history_denied_channel_ids"() IS 'Returns explicit false channel.read_history overrides so app-level deploy history visibility excludes denied channels.';

REVOKE ALL ON FUNCTION "public"."channel_history_denied_channel_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."channel_history_denied_channel_ids"() TO "service_role";
GRANT ALL ON FUNCTION "public"."channel_history_denied_channel_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."channel_history_denied_channel_ids"() TO "authenticated";

DROP POLICY IF EXISTS "Deny deploy history for channels without read_history" ON "public"."deploy_history";

CREATE POLICY "Deny deploy history for channels without read_history" ON "public"."deploy_history"
    AS RESTRICTIVE
    FOR SELECT
    TO "anon", "authenticated"
    USING (
        NOT ("channel_id" = ANY (COALESCE((SELECT "public"."channel_history_denied_channel_ids"() AS "channel_history_denied_channel_ids"), '{}'::bigint[])))
    );

COMMENT ON POLICY "Deny deploy history for channels without read_history" ON "public"."deploy_history" IS 'Hides deploy history rows for channels where the request principal has an explicit channel.read_history deny override.';
