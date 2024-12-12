REVOKE ALL ON FUNCTION "public"."replicate_to_d1"(record jsonb, old_record jsonb, operation text, table_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replicate_to_d1"(record jsonb, old_record jsonb, operation text, table_name text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_d1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_d1"() TO "service_role";
