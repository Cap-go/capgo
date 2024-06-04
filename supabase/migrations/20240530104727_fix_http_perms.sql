REVOKE ALL ON FUNCTION "public"."http_post_helper"("function_name" "text", "function_type" "text", "body" "jsonb") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."http_post_helper"("function_name" "text", "function_type" "text", "body" "jsonb") FROM "anon";
REVOKE ALL ON FUNCTION "public"."http_post_helper"("function_name" "text", "function_type" "text", "body" "jsonb") FROM "authenticated";
GRANT ALL ON FUNCTION "public"."http_post_helper"("function_name" "text", "function_type" "text", "body" "jsonb") TO "service_role";
