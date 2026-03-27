-- Standardize cron_sync_sub queue messages with the shared payload envelope
-- consumed by queue_consumer while preserving the legacy Supabase routing.
CREATE OR REPLACE FUNCTION public.process_cron_sync_sub_jobs() RETURNS void
LANGUAGE plpgsql
SET search_path = '' AS $function$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN
    SELECT DISTINCT
      o.id,
      si.customer_id
    FROM public.orgs AS o
    INNER JOIN public.stripe_info AS si ON o.customer_id = si.customer_id
    WHERE o.customer_id IS NOT NULL
      AND si.customer_id IS NOT NULL
  LOOP
    PERFORM pgmq.send(
      'cron_sync_sub',
      pg_catalog.jsonb_build_object(
        'function_name', 'cron_sync_sub',
        'function_type', NULL,
        'payload', pg_catalog.jsonb_build_object(
          'orgId', org_record.id,
          'customerId', org_record.customer_id
        )
      )
    );
  END LOOP;
END;
$function$;

ALTER FUNCTION public.process_cron_sync_sub_jobs() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.process_cron_sync_sub_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_cron_sync_sub_jobs() FROM anon;
REVOKE ALL ON FUNCTION public.process_cron_sync_sub_jobs() FROM authenticated;
REVOKE ALL ON FUNCTION public.process_cron_sync_sub_jobs() FROM service_role;

GRANT EXECUTE ON FUNCTION public.process_cron_sync_sub_jobs() TO service_role;
