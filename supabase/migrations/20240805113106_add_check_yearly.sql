CREATE OR REPLACE FUNCTION public.is_org_yearly(orgid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_yearly boolean;
BEGIN
    SELECT 
        CASE
            WHEN si.price_id = p.price_y_id THEN true
            ELSE false
        END INTO is_yearly
    FROM orgs o
    JOIN stripe_info si ON o.customer_id = si.customer_id
    JOIN plans p ON si.product_id = p.stripe_id
    WHERE o.id = orgid
    LIMIT 1;

    RETURN COALESCE(is_yearly, false);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_orgs_v6"("userid" "uuid") 
RETURNS TABLE(
    "gid" "uuid", 
    "created_by" "uuid", 
    "logo" "text", 
    "name" "text", 
    "role" character varying, 
    "paying" boolean, 
    "trial_left" integer, 
    "can_use_more" boolean, 
    "is_canceled" boolean, 
    "app_count" bigint, 
    "subscription_start" timestamp with time zone, 
    "subscription_end" timestamp with time zone, 
    "management_email" "text",
    "is_yearly" boolean
)
LANGUAGE "plpgsql" 
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    sub.id AS gid, 
    sub.created_by, 
    sub.logo, 
    sub.name, 
    org_users.user_right::varchar AS role, 
    is_paying_org(sub.id) AS paying,
    is_trial_org(sub.id) AS trial_left, 
    is_allowed_action_org(sub.id) AS can_use_more,
    is_canceled_org(sub.id) AS is_canceled,
    (SELECT count(*) FROM apps WHERE owner_org = sub.id) AS app_count,
    (sub.f).subscription_anchor_start AS subscription_start,
    (sub.f).subscription_anchor_end AS subscription_end,
    sub.management_email AS management_email,
    is_org_yearly(sub.id) AS is_yearly
  FROM (
    SELECT get_cycle_info_org(o.id) AS f, o.* AS o FROM orgs AS o
  ) sub
  JOIN org_users ON (org_users."user_id" = get_orgs_v6.userid AND sub.id = org_users."org_id");
END;  
$$;

ALTER FUNCTION "public"."get_orgs_v6"("userid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_orgs_v6"()
RETURNS TABLE(
    "gid" "uuid", 
    "created_by" "uuid", 
    "logo" "text", 
    "name" "text", 
    "role" character varying, 
    "paying" boolean, 
    "trial_left" integer, 
    "can_use_more" boolean, 
    "is_canceled" boolean, 
    "app_count" bigint, 
    "subscription_start" timestamp with time zone, 
    "subscription_end" timestamp with time zone, 
    "management_email" "text",
    "is_yearly" boolean
)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_id uuid;
BEGIN
  SELECT get_identity('{read,upload,write,all}'::"public"."key_mode"[]) into user_id;
  IF user_id IS NOT DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'Cannot do that as postgres!';
  END IF;

  return query select * from get_orgs_v6("user_id");
END;  
$$;

ALTER FUNCTION "public"."get_orgs_v6"() OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_orgs_v6"("userid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_orgs_v6"("userid" "uuid") TO "service_role";
