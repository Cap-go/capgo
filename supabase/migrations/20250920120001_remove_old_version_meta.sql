alter table "public"."app_versions_meta"
drop column if exists "devices";

alter table "public"."app_versions_meta"
drop column if exists "fails";

alter table "public"."app_versions_meta"
drop column if exists "installs";

alter table "public"."app_versions_meta"
drop column if exists "uninstalls";
