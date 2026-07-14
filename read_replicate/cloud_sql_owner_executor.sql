BEGIN;

CREATE SCHEMA IF NOT EXISTS capgo_internal AUTHORIZATION postgres;
ALTER SCHEMA capgo_internal OWNER TO postgres;
REVOKE ALL ON SCHEMA capgo_internal FROM PUBLIC;

DO $bootstrap$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'capgo_read_replica_schema_executor'
  ) THEN
    CREATE ROLE capgo_read_replica_schema_executor
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$bootstrap$;

ALTER ROLE capgo_read_replica_schema_executor
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS;

CREATE OR REPLACE FUNCTION capgo_internal.add_read_replica_column(
  p_table_name pg_catalog.text,
  p_column_name pg_catalog.text,
  p_expected_type pg_catalog.text,
  p_default_literal pg_catalog.text,
  p_not_null pg_catalog.bool
)
RETURNS pg_catalog.void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_type pg_catalog.text;
  v_default_clause pg_catalog.text := '';
BEGIN
  IF session_user <> 'capgo-read-replica-ci@capgo-394818.iam' THEN
    RAISE EXCEPTION 'Read-replica schema executor is restricted to its Cloud SQL IAM principal';
  END IF;
  IF pg_catalog.pg_has_role(session_user, 'cloudsqlsuperuser', 'member') THEN
    RAISE EXCEPTION 'Read-replica schema executor refuses cloudsqlsuperuser membership';
  END IF;

  IF (
    p_table_name IS NULL
    OR pg_catalog.octet_length(p_table_name) > 63
    OR p_table_name !~ '^[A-Za-z_][A-Za-z0-9_]*$'
    OR p_table_name NOT IN (
      'orgs',
      'stripe_info',
      'org_users',
      'apps',
      'app_versions',
      'channels',
      'channel_devices',
      'manifest',
      'notifications',
      'onboarding_demo_data'
    )
  ) THEN
    RAISE EXCEPTION 'Read-replica schema executor rejected the table';
  END IF;

  IF (
    p_column_name IS NULL
    OR pg_catalog.octet_length(p_column_name) > 63
    OR p_column_name !~ '^[A-Za-z_][A-Za-z0-9_]*$'
  ) THEN
    RAISE EXCEPTION 'Read-replica schema executor rejected the column';
  END IF;

  IF (
    p_expected_type IS NULL
    OR pg_catalog.octet_length(p_expected_type) > 128
    OR p_not_null IS NULL
    OR (
      p_default_literal IS NOT NULL
      AND pg_catalog.octet_length(p_default_literal) > 8192
    )
  ) THEN
    RAISE EXCEPTION 'Read-replica schema executor rejected the column definition';
  END IF;

  IF p_not_null AND p_default_literal IS NULL THEN
    RAISE EXCEPTION 'Read-replica schema executor requires a backfill literal for NOT NULL columns';
  END IF;

  PERFORM 1
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = p_table_name
    AND relation.relkind IN ('r', 'p');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Read-replica schema executor could not find the selected table';
  END IF;

  SELECT pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
  INTO v_type
  FROM pg_catalog.pg_attribute AS attribute
  JOIN pg_catalog.pg_class AS relation
    ON relation.oid = attribute.attrelid
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = ANY (
      ARRAY[
        'orgs',
        'stripe_info',
        'org_users',
        'apps',
        'app_versions',
        'channels',
        'channel_devices',
        'manifest',
        'notifications',
        'onboarding_demo_data'
      ]::pg_catalog.text[]
    )
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = p_expected_type
  ORDER BY relation.oid, attribute.attnum
  LIMIT 1;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Read-replica schema executor rejected the column type';
  END IF;

  IF p_default_literal IS NOT NULL THEN
    v_default_clause := pg_catalog.format(
      ' DEFAULT %L::%s',
      p_default_literal,
      v_type
    );
  END IF;

  EXECUTE pg_catalog.format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I %s%s%s',
    p_table_name,
    p_column_name,
    v_type,
    v_default_clause,
    CASE WHEN p_not_null THEN ' NOT NULL' ELSE '' END
  );
END
$function$;

DROP FUNCTION IF EXISTS capgo_internal.set_read_replica_column_not_null(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text
);

ALTER FUNCTION capgo_internal.add_read_replica_column(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.bool
) OWNER TO postgres;

REVOKE ALL ON FUNCTION capgo_internal.add_read_replica_column(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.bool
) FROM PUBLIC;

GRANT USAGE ON SCHEMA capgo_internal TO capgo_read_replica_schema_executor;
GRANT EXECUTE ON FUNCTION capgo_internal.add_read_replica_column(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.bool
) TO capgo_read_replica_schema_executor;

COMMIT;
