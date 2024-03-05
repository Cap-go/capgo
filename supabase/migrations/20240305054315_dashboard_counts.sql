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
    SELECT 'Free' AS product_name
    UNION
    SELECT 'Trial' AS product_name
  ),
  StatusCounts AS (
    SELECT 
      p.name AS product_name, 
      COUNT(*) AS count
    FROM stripe_info si
    INNER JOIN plans p ON si.product_id = p.stripe_id AND si.status = 'succeeded' AND si.product_id <> 'free'
    GROUP BY p.name
    
    UNION ALL
    
    SELECT 
      'Free' AS product_name, 
      COUNT(*) AS count
    FROM stripe_info si
    WHERE si.product_id = 'free' AND (si.trial_at <= NOW() OR si.status = 'succeeded')
    
    UNION ALL
    
    SELECT 
      'Trial' AS product_name, 
      COUNT(*) AS count
    FROM stripe_info si
    WHERE si.product_id = 'free' AND si.trial_at > NOW()
  )
  SELECT
    ap.product_name,
    COALESCE(sc.count, 0) AS count
  FROM AllProducts ap
  LEFT JOIN StatusCounts sc ON ap.product_name = sc.product_name
  ORDER BY ap.product_name;
END;
$$;
