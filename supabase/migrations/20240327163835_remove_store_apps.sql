DROP FUNCTION "public"."count_all_apps"();
DROP FUNCTION "public"."count_all_updates"();
DROP FUNCTION "public"."increment_store"("app_id" character varying, "updates" integer);
drop table store_apps;
