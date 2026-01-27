-- Enforce HTML tag stripping at the database layer for org/app/user fields.

CREATE OR REPLACE FUNCTION "public"."strip_html"(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN input IS NULL THEN NULL
    ELSE btrim(regexp_replace(input, '<[^>]*>', '', 'g'))
  END;
$$;

CREATE OR REPLACE FUNCTION "public"."sanitize_orgs_text_fields"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW."name" := public.strip_html(NEW."name");
  NEW."management_email" := public.strip_html(NEW."management_email");
  NEW."logo" := public.strip_html(NEW."logo");
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."sanitize_apps_text_fields"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW."name" := public.strip_html(NEW."name");
  NEW."icon_url" := public.strip_html(NEW."icon_url");
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."sanitize_users_text_fields"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW."email" := public.strip_html(NEW."email");
  NEW."first_name" := public.strip_html(NEW."first_name");
  NEW."last_name" := public.strip_html(NEW."last_name");
  NEW."country" := public.strip_html(NEW."country");
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."sanitize_tmp_users_text_fields"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW."email" := public.strip_html(NEW."email");
  NEW."first_name" := public.strip_html(NEW."first_name");
  NEW."last_name" := public.strip_html(NEW."last_name");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "sanitize_orgs_text_fields" ON "public"."orgs";
CREATE TRIGGER "sanitize_orgs_text_fields"
BEFORE INSERT OR UPDATE ON "public"."orgs"
FOR EACH ROW
EXECUTE FUNCTION "public"."sanitize_orgs_text_fields"();

DROP TRIGGER IF EXISTS "sanitize_apps_text_fields" ON "public"."apps";
CREATE TRIGGER "sanitize_apps_text_fields"
BEFORE INSERT OR UPDATE ON "public"."apps"
FOR EACH ROW
EXECUTE FUNCTION "public"."sanitize_apps_text_fields"();

DROP TRIGGER IF EXISTS "sanitize_users_text_fields" ON "public"."users";
CREATE TRIGGER "sanitize_users_text_fields"
BEFORE INSERT OR UPDATE ON "public"."users"
FOR EACH ROW
EXECUTE FUNCTION "public"."sanitize_users_text_fields"();

DROP TRIGGER IF EXISTS "sanitize_tmp_users_text_fields" ON "public"."tmp_users";
CREATE TRIGGER "sanitize_tmp_users_text_fields"
BEFORE INSERT OR UPDATE ON "public"."tmp_users"
FOR EACH ROW
EXECUTE FUNCTION "public"."sanitize_tmp_users_text_fields"();
