CREATE OR REPLACE FUNCTION get_customer_counts()
RETURNS TABLE (
  yearly BIGINT,
  monthly BIGINT,
  total BIGINT
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(CASE WHEN p.price_y_id = s.price_id AND s.status = 'succeeded' THEN s.customer_id END) AS yearly,
    COUNT(CASE WHEN p.price_m_id = s.price_id AND s.status = 'succeeded' THEN s.customer_id END) AS monthly,
    COUNT(CASE WHEN s.status = 'succeeded' THEN s.customer_id END) AS total
  FROM
    stripe_info s
    JOIN plans p ON s.price_id = p.price_y_id OR s.price_id = p.price_m_id
  WHERE
    s.status = 'succeeded';
END;
$$ LANGUAGE plpgsql;

ALTER TABLE global_stats ADD COLUMN paying_yearly INTEGER DEFAULT 0;
ALTER TABLE global_stats ADD COLUMN paying_monthly INTEGER DEFAULT 0;
DROP FUNCTION count_all_paying();
