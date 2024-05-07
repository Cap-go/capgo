CREATE OR REPLACE FUNCTION process_free_trial_expired()
RETURNS VOID AS $$
BEGIN
  UPDATE stripe_info
  SET is_good_plan = false
  WHERE status <> 'succeeded' AND trial_at < NOW();
END;
$$ LANGUAGE plpgsql;

delete from plans where name = 'Free';

ALTER TABLE orgs
DROP CONSTRAINT "unique management_email on orgs";

CREATE OR REPLACE FUNCTION "public"."count_all_plans_v2"() 
RETURNS TABLE("plan_name" character varying, "count" bigint) 
LANGUAGE "plpgsql"
AS $$
BEGIN
  RETURN QUERY 
  WITH AllProducts AS (
    SELECT p.name AS product_name
    FROM stripe_info si
    INNER JOIN plans p ON si.product_id = p.stripe_id
    UNION
    SELECT 'Trial' AS product_name
  ),
  StatusCounts AS (
    SELECT 
      p.name AS product_name, 
      COUNT(*) AS count
    FROM stripe_info si
    INNER JOIN plans p ON si.product_id = p.stripe_id AND si.status = 'succeeded'
    GROUP BY p.name
    
    UNION ALL
    
    SELECT 
      'Trial' AS product_name, 
      COUNT(*) AS count
    FROM stripe_info si
    WHERE si.trial_at > NOW()
  )
  SELECT
    ap.product_name,
    COALESCE(sc.count, 0) AS count
  FROM AllProducts ap
  LEFT JOIN StatusCounts sc ON ap.product_name = sc.product_name
  ORDER BY ap.product_name;
END;
$$;
