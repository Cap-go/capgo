DROP FUNCTION public.http_post_helper(function_name text, function_type text, body jsonb);

DROP TRIGGER replicate_channel_insert ON "public"."channels";
DROP TRIGGER replicate_channel_update ON "public"."channels";
DROP TRIGGER replicate_channel_drop ON "public"."channels";

DROP TRIGGER replicate_version_insert ON "public"."app_versions";
DROP TRIGGER replicate_version_update ON "public"."app_versions";
DROP TRIGGER replicate_version_drop ON "public"."app_versions";

DROP TRIGGER replicate_apps_insert ON "public"."apps";
DROP TRIGGER replicate_apps_update ON "public"."apps";
DROP TRIGGER replicate_apps_drop ON "public"."apps";

DROP TRIGGER replicate_channel_devices_insert ON "public"."channel_devices";
DROP TRIGGER replicate_channel_devices_update ON "public"."channel_devices";
DROP TRIGGER replicate_channel_devices_drop ON "public"."channel_devices";

DROP TRIGGER replicate_devices_override_insert ON "public"."devices_override";
DROP TRIGGER replicate_devices_override_update ON "public"."devices_override";
DROP TRIGGER replicate_devices_override_drop ON "public"."devices_override";

DROP FUNCTION "public"."post_replication_sql"(sql_query text);
DROP FUNCTION "public"."post_replication_sql"(sql_query text, params text[]);
DROP FUNCTION "public"."replicate_insert"();
DROP FUNCTION "public"."replicate_update"();
DROP FUNCTION "public"."replicate_drop"();
DROP FUNCTION "public"."replicate_drop_double"();
DROP FUNCTION "public"."replicate_update_double"();

CREATE OR REPLACE FUNCTION public.http_post_helper(function_name text, function_type text, body jsonb) 
RETURNS bigint 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $BODY$
<<declared>>
DECLARE 
  request_id text;
  headers jsonb;
  url text;
BEGIN 
  -- Determine the URL based on the function_type
  IF function_type = 'external' THEN
    url := get_external_function_url() || function_name;
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'apisecret',
      get_apikey()
    );
  ELSE
    url := get_db_url() || '/functions/v1/triggers/' || function_name;
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'apisecret',
      get_apikey()
    );
  END IF;

  -- Make an async HTTP POST request using pg_net
  SELECT INTO request_id net.http_post(
    url := declared.url,
    headers := declared.headers,
    body := body,
    timeout_milliseconds := 15000
  );
  return request_id;
END;
$BODY$;
