-- Paginated org apps listing that exposes each app's real "last upload" time.
--
-- The apps table only stores `updated_at`, which is bumped by unrelated edits and
-- background/cron jobs (e.g. channel device-count refresh), so it is not a reliable
-- "last upload" signal. This RPC derives `last_upload_at` from the created_at of the
-- bundle matching the app's `last_version` and lets the database own search, sort,
-- pagination and the total count so page ordering matches the displayed column.
--
-- It returns the full apps row (plus last_upload_at and total_count) so it stays a
-- drop-in replacement for the previous `from('apps').select()` query and the frontend
-- needs no type assertions.
--
-- SECURITY INVOKER: the function intentionally runs with the caller's rights so the
-- existing RLS on `apps` (and `app_versions`) performs all visibility filtering. This
-- mirrors the previous `from('apps').eq('owner_org', ...)` client query and avoids any
-- privilege escalation. `p_org_id` is an additional, indexed narrowing filter on top of
-- RLS, never a replacement for it.
--
-- Scalability: the only per-row work is a LATERAL lookup into app_versions keyed by
-- (app_id, name) which is served by the existing idx_app_id_name_app_versions index as a
-- bounded equality seek. The outer scan is bounded to one org's apps via finx_apps_owner_org
-- and then to a single page via LIMIT/OFFSET, so no large table is scanned per request.

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
    -- Whitelist sort keys to avoid dynamic-SQL injection via p_sort_by.
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
            a.*,
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
        -- NULLS LAST in both directions so apps without uploads sort to the bottom.
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
        -- Stable tiebreaker so pagination is deterministic across pages.
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
) IS 'Paginated apps for one org with a derived last_upload_at (created_at of the bundle matching apps.last_version). Returns the full apps row plus last_upload_at and total_count. SECURITY INVOKER so RLS on apps/app_versions enforces visibility; p_org_id is an indexed narrowing filter on top of RLS. Search/sort/pagination/total_count are computed in SQL so page order matches the displayed last-upload sort.';

-- Least privilege: no PUBLIC, only the user-context roles the frontend uses plus service_role.
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
