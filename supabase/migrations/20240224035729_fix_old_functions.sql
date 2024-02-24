CREATE OR REPLACE FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision) RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT name
  FROM plans
  WHERE plans.mau>=find_best_plan_v3.mau
    AND plans.storage>=find_best_plan_v3.storage
    AND plans.bandwidth>=find_best_plan_v3.bandwidth
    OR plans.name = 'Pay as you go'
    ORDER BY plans.mau
    LIMIT 1);
End;  
$$;


CREATE OR REPLACE FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision) RETURNS TABLE("name" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN

RETURN QUERY (
  SELECT plans.name
  FROM plans
  WHERE plans.mau >= find_fit_plan_v3.mau
    AND plans.storage >= find_fit_plan_v3.storage
    AND plans.bandwidth >= find_fit_plan_v3.bandwidth
    OR plans.name = 'Pay as you go'
  ORDER BY plans.mau
);
END;
$$;
