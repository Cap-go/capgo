CREATE OR REPLACE FUNCTION "public"."get_customer_counts"() 
RETURNS TABLE("yearly" bigint, "monthly" bigint, "total" bigint)
LANGUAGE "plpgsql"
AS $$
BEGIN
  RETURN QUERY
  WITH ActiveSubscriptions AS (
    -- Get the most recent subscription for each customer
    SELECT DISTINCT ON (customer_id)
      customer_id,
      price_id,
      status,
      trial_at,
      canceled_at
    FROM stripe_info
    WHERE status = 'succeeded'
      AND (canceled_at IS NULL OR canceled_at > NOW())
    ORDER BY customer_id, created_at DESC
  )
  SELECT
    COUNT(CASE 
      WHEN s.price_id IN (SELECT price_y_id FROM plans WHERE price_y_id IS NOT NULL) 
      THEN 1 
    END) AS yearly,
    COUNT(CASE 
      WHEN s.price_id IN (SELECT price_m_id FROM plans WHERE price_m_id IS NOT NULL) 
      THEN 1 
    END) AS monthly,
    COUNT(*) AS total
  FROM ActiveSubscriptions s;
END;
$$; 

CREATE OR REPLACE FUNCTION "public"."count_all_plans_v2"() 
RETURNS TABLE("plan_name" character varying, "count" bigint)
LANGUAGE "plpgsql"
AS $$
BEGIN
  RETURN QUERY 
  WITH ActiveSubscriptions AS (
    SELECT DISTINCT ON (si.customer_id)
      p.name AS product_name,
      si.customer_id
    FROM stripe_info si
    INNER JOIN plans p ON si.product_id = p.stripe_id 
    WHERE si.status = 'succeeded'
      AND (si.canceled_at IS NULL OR si.canceled_at > NOW())
    ORDER BY si.customer_id, si.created_at DESC
  ),
  TrialUsers AS (
    SELECT DISTINCT ON (si.customer_id)
      'Trial' AS product_name,
      si.customer_id
    FROM stripe_info si
    WHERE si.trial_at > NOW() 
    AND si.status is NULL
    AND (si.canceled_at IS NULL OR si.canceled_at > NOW())
    AND NOT EXISTS (
      SELECT 1 FROM ActiveSubscriptions a 
      WHERE a.customer_id = si.customer_id
    )
  )
  SELECT 
    product_name as plan_name,
    COUNT(*) as count
  FROM (
    SELECT product_name, customer_id FROM ActiveSubscriptions
    UNION ALL
    SELECT product_name, customer_id FROM TrialUsers
  ) all_subs
  GROUP BY product_name;
END;
$$; 

CREATE OR REPLACE FUNCTION "public"."count_all_need_upgrade"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT COUNT(*) FROM stripe_info WHERE is_good_plan = false AND status = 'succeeded' AND (canceled_at IS NULL OR canceled_at > NOW()));
End;  
$$;
