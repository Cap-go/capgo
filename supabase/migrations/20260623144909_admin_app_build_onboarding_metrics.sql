ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS created_from_onboarding boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamp with time zone;

COMMENT ON COLUMN public.apps.created_from_onboarding IS 'True when the app was created from the guided CLI onboarding flow.';
COMMENT ON COLUMN public.apps.onboarding_completed_at IS 'Timestamp when the guided onboarding flow was completed for this app.';

CREATE OR REPLACE FUNCTION public.set_app_onboarding_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.need_onboarding IS TRUE
    AND NEW.need_onboarding IS FALSE
    AND NEW.onboarding_completed_at IS NULL THEN
    NEW.onboarding_completed_at = CURRENT_TIMESTAMP;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_app_onboarding_completed_at() OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.set_app_onboarding_completed_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS set_app_onboarding_completed_at ON public.apps;
CREATE TRIGGER set_app_onboarding_completed_at
BEFORE UPDATE OF need_onboarding ON public.apps
FOR EACH ROW
WHEN (OLD.need_onboarding IS TRUE AND NEW.need_onboarding IS FALSE)
EXECUTE FUNCTION public.set_app_onboarding_completed_at();

UPDATE public.apps
SET created_from_onboarding = true
WHERE need_onboarding IS TRUE
  AND created_from_onboarding IS FALSE;

ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS apps_created bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apps_with_cli_onboarding_builds_24h bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apps_with_manual_builds_24h bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.global_stats.apps_created IS 'Number of apps created during the UTC day.';
COMMENT ON COLUMN public.global_stats.apps_with_cli_onboarding_builds_24h IS 'Number of apps created during the UTC day, created from onboarding, completed onboarding within 24 hours, and created more than two native build requests in the first 24 hours after app creation.';
COMMENT ON COLUMN public.global_stats.apps_with_manual_builds_24h IS 'Number of apps created during the UTC day, not created from onboarding, and created more than two native build requests in the first 24 hours after app creation.';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_apps_created_at
ON public.apps (created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_build_requests_app_created_at
ON public.build_requests (app_id, created_at);

-- Keep the app-list RPC stable after adding app metadata columns. The function
-- intentionally returns its original column contract, so it must not select
-- apps.* because future app columns would shift last_upload_at/total_count.
DROP FUNCTION IF EXISTS public.get_org_apps_with_last_upload(uuid, text, text, boolean, integer, integer);

CREATE OR REPLACE FUNCTION "public"."get_org_apps_with_last_upload"(
    "p_org_id" "uuid",
    "p_search" "text" DEFAULT NULL,
    "p_sort_by" "text" DEFAULT 'last_upload_at',
    "p_sort_desc" boolean DEFAULT true,
    "p_limit" integer DEFAULT 10,
    "p_offset" integer DEFAULT 0
)
RETURNS TABLE(
    "created_at" timestamp with time zone,
    "app_id" character varying,
    "icon_url" character varying,
    "user_id" "uuid",
    "name" character varying,
    "last_version" character varying,
    "updated_at" timestamp with time zone,
    "id" "uuid",
    "retention" bigint,
    "owner_org" "uuid",
    "default_upload_channel" character varying,
    "transfer_history" "jsonb"[],
    "channel_device_count" bigint,
    "manifest_bundle_count" bigint,
    "expose_metadata" boolean,
    "allow_preview" boolean,
    "allow_device_custom_id" boolean,
    "need_onboarding" boolean,
    "existing_app" boolean,
    "ios_store_url" "text",
    "android_store_url" "text",
    "stats_updated_at" timestamp without time zone,
    "stats_refresh_requested_at" timestamp without time zone,
    "build_timeout_seconds" bigint,
    "build_timeout_updated_at" timestamp with time zone,
    "last_upload_at" timestamp with time zone,
    "total_count" bigint
)
LANGUAGE "plpgsql"
SECURITY INVOKER
SET "search_path" TO ''
AS $$
DECLARE
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
    v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
    v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
    v_sort text := CASE
        WHEN p_sort_by IN ('name', 'last_version', 'updated_at', 'created_at', 'last_upload_at')
            THEN p_sort_by
        ELSE 'last_upload_at'
    END;
    v_desc boolean := COALESCE(p_sort_desc, true);
BEGIN
    RETURN QUERY
    WITH scoped AS (
        SELECT
            a.created_at,
            a.app_id,
            a.icon_url,
            a.user_id,
            a.name,
            a.last_version,
            a.updated_at,
            a.id,
            a.retention,
            a.owner_org,
            a.default_upload_channel,
            a.transfer_history,
            a.channel_device_count,
            a.manifest_bundle_count,
            a.expose_metadata,
            a.allow_preview,
            a.allow_device_custom_id,
            a.need_onboarding,
            a.existing_app,
            a.ios_store_url,
            a.android_store_url,
            a.stats_updated_at,
            a.stats_refresh_requested_at,
            a.build_timeout_seconds,
            a.build_timeout_updated_at,
            lv.created_at AS last_upload_at
        FROM public.apps a
        LEFT JOIN LATERAL (
            SELECT av.created_at
            FROM public.app_versions av
            WHERE av.app_id = a.app_id
              AND av.name = a.last_version
              AND av.deleted = false
            ORDER BY av.created_at DESC
            LIMIT 1
        ) lv ON a.last_version IS NOT NULL
        WHERE a.owner_org = p_org_id
          AND (
            v_search IS NULL
            OR a.name ILIKE '%' || v_search || '%'
            OR a.app_id ILIKE '%' || v_search || '%'
          )
    )
    SELECT
        s.*,
        COUNT(*) OVER () AS total_count
    FROM scoped s
    ORDER BY
        CASE WHEN v_sort = 'last_upload_at' AND v_desc THEN s.last_upload_at END DESC NULLS LAST,
        CASE WHEN v_sort = 'last_upload_at' AND NOT v_desc THEN s.last_upload_at END ASC NULLS LAST,
        CASE WHEN v_sort = 'updated_at' AND v_desc THEN s.updated_at END DESC NULLS LAST,
        CASE WHEN v_sort = 'updated_at' AND NOT v_desc THEN s.updated_at END ASC NULLS LAST,
        CASE WHEN v_sort = 'created_at' AND v_desc THEN s.created_at END DESC NULLS LAST,
        CASE WHEN v_sort = 'created_at' AND NOT v_desc THEN s.created_at END ASC NULLS LAST,
        CASE WHEN v_sort = 'name' AND v_desc THEN s.name END DESC NULLS LAST,
        CASE WHEN v_sort = 'name' AND NOT v_desc THEN s.name END ASC NULLS LAST,
        CASE WHEN v_sort = 'last_version' AND v_desc THEN s.last_version END DESC NULLS LAST,
        CASE WHEN v_sort = 'last_version' AND NOT v_desc THEN s.last_version END ASC NULLS LAST,
        s.app_id ASC
    LIMIT v_limit
    OFFSET v_offset;
END;
$$;

ALTER FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) IS 'Paginated apps for one org with a derived last_upload_at (created_at of the bundle matching apps.last_version). Returns the stable apps list contract plus last_upload_at and total_count. SECURITY INVOKER so RLS on apps/app_versions enforces visibility; p_org_id is an indexed narrowing filter on top of RLS. Search/sort/pagination/total_count are computed in SQL so page order matches the displayed last-upload sort.';

REVOKE ALL ON FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) TO "service_role";
