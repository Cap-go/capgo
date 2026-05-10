ALTER TABLE "public"."plans"
ADD COLUMN "native_build_concurrency" integer DEFAULT 2 NOT NULL;

UPDATE "public"."plans"
SET "native_build_concurrency" = 2
WHERE "name" = 'Solo';

UPDATE "public"."plans"
SET "native_build_concurrency" = 3
WHERE "name" = 'Maker';

UPDATE "public"."plans"
SET "native_build_concurrency" = 4
WHERE "name" = 'Team';

UPDATE "public"."plans"
SET "native_build_concurrency" = 6
WHERE "name" = 'Enterprise';

ALTER TABLE "public"."plans"
ADD CONSTRAINT "plans_native_build_concurrency_positive"
CHECK ("native_build_concurrency" > 0);

COMMENT ON COLUMN "public"."plans"."native_build_concurrency" IS 'Maximum number of active native builds allowed concurrently for this plan.';

DROP FUNCTION IF EXISTS "public"."get_current_plan_max_org"("orgid" "uuid");

CREATE OR REPLACE FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid")
RETURNS TABLE(
  "mau" bigint,
  "bandwidth" bigint,
  "storage" bigint,
  "build_time_unit" bigint,
  "native_build_concurrency" integer
)
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_request_user uuid;
  v_request_role text;
  v_is_internal boolean;
BEGIN
  SELECT public.current_request_role() INTO v_request_role;

  v_is_internal := public.is_internal_request_role(v_request_role);

  IF NOT v_is_internal THEN
    v_request_user := public.get_identity_org_allowed(
      public.request_read_key_modes(),
      get_current_plan_max_org.orgid
    );

    IF NOT public.request_has_org_read_access(get_current_plan_max_org.orgid) THEN
      PERFORM public.pg_log(
        'deny: NO_RIGHTS',
        pg_catalog.jsonb_build_object(
          'orgid',
          get_current_plan_max_org.orgid,
          'uid',
          v_request_user
        )
      );
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p.mau,
    p.bandwidth,
    p.storage,
    p.build_time_unit,
    p.native_build_concurrency
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;
END;
$$;

ALTER FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "service_role";
