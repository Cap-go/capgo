CREATE SCHEMA stats_partitions;

CREATE OR REPLACE FUNCTION create_partitions(start_date DATE, num_years INTEGER)
RETURNS VOID AS $$
DECLARE
   end_date DATE := start_date + INTERVAL '1 year' * num_years;
   date_iterator DATE := start_date;
BEGIN
   WHILE date_iterator < end_date LOOP
      EXECUTE format('CREATE TABLE IF NOT EXISTS stats_partitions.stats_%s PARTITION OF public.stats FOR VALUES FROM (%L) TO (%L)', 
                     to_char(date_iterator, 'YYYY_MM_DD'), 
                     date_iterator, 
                     date_iterator + INTERVAL '1 day');
      date_iterator := date_iterator + INTERVAL '1 day';
   END LOOP;
END $$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.create_partitions(start_date DATE, num_years INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_partitions(start_date DATE, num_years INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_partitions(start_date DATE, num_years INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_partitions(start_date DATE, num_years INTEGER) TO postgres;

SELECT create_partitions((CURRENT_DATE - INTERVAL '1 day')::DATE, 1);
