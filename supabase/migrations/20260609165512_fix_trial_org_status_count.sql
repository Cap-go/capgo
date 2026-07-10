CREATE OR REPLACE FUNCTION "public"."count_all_plans_v2"()
RETURNS TABLE("plan_name" character varying, "count" bigint)
LANGUAGE "plpgsql"
SET "search_path" TO ''
AS $$
BEGIN
  RETURN QUERY
  WITH ActiveSubscriptions AS (
    SELECT DISTINCT ON (si.customer_id)
      p.name AS product_name,
      si.customer_id
    FROM public.stripe_info si
    INNER JOIN public.plans p ON si.product_id = p.stripe_id
    WHERE si.status = 'succeeded'
    ORDER BY si.customer_id, si.created_at DESC
  ),
  TrialUsers AS (
    SELECT DISTINCT ON (si.customer_id)
      'Trial'::character varying AS product_name,
      si.customer_id
    FROM public.stripe_info si
    WHERE si.trial_at > NOW()
      AND si.status IS DISTINCT FROM 'succeeded'
      AND NOT EXISTS (
        SELECT 1
        FROM ActiveSubscriptions a
        WHERE a.customer_id = si.customer_id
      )
    ORDER BY si.customer_id, si.created_at DESC
  )
  SELECT
    product_name AS plan_name,
    COUNT(*) AS count
  FROM (
    SELECT product_name, customer_id FROM ActiveSubscriptions
    UNION ALL
    SELECT product_name, customer_id FROM TrialUsers
  ) all_subs
  GROUP BY product_name;
END;
$$;

ALTER FUNCTION "public"."count_all_plans_v2"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."count_all_plans_v2"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."count_all_plans_v2"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."count_all_plans_v2"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."count_all_plans_v2"() TO "service_role";
