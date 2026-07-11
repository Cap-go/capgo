-- Keep local migrations aligned with the primary schema used by the read replica.
DO $$
DECLARE
  existing_name "text";
  existing_definition "text";
  existing_valid "boolean";
BEGIN
  SELECT
    "conname",
    "pg_catalog"."pg_get_constraintdef"("oid", true)
  INTO existing_name, existing_definition
  FROM "pg_catalog"."pg_constraint"
  WHERE "conrelid" = 'public.channel_devices'::"regclass"
    AND "contype" = 'p';

  IF existing_name IS NULL THEN
    ALTER TABLE "public"."channel_devices"
      ADD CONSTRAINT "channel_devices_pkey" PRIMARY KEY ("id");
  ELSIF existing_name <> 'channel_devices_pkey'
    OR "pg_catalog"."regexp_replace"(
      "pg_catalog"."lower"(existing_definition),
      '[^a-z0-9_]+',
      '',
      'g'
    ) <> 'primarykeyid' THEN
    RAISE EXCEPTION
      'channel_devices primary key conflicts with expected channel_devices_pkey (id): % %',
      existing_name,
      existing_definition;
  END IF;

  SELECT
    "pg_catalog"."pg_get_indexdef"(index_class."oid"),
    index_info."indisvalid"
  INTO existing_definition, existing_valid
  FROM "pg_catalog"."pg_class" AS index_class
  JOIN "pg_catalog"."pg_namespace" AS index_namespace
    ON index_namespace."oid" = index_class."relnamespace"
  JOIN "pg_catalog"."pg_index" AS index_info
    ON index_info."indexrelid" = index_class."oid"
  WHERE index_namespace."nspname" = 'public'
    AND index_class."relname" = 'si_customer_cover_uidx';

  IF existing_definition IS NULL THEN
    CREATE UNIQUE INDEX "si_customer_cover_uidx"
      ON "public"."stripe_info" USING "btree" ("customer_id")
      INCLUDE (
        "status",
        "trial_at",
        "mau_exceeded",
        "storage_exceeded",
        "bandwidth_exceeded"
      );
  ELSIF NOT existing_valid
    OR "pg_catalog"."regexp_replace"(
      "pg_catalog"."lower"(existing_definition),
      '[^a-z0-9_]+',
      '',
      'g'
    ) <> 'createuniqueindexsi_customer_cover_uidxonpublicstripe_infousingbtreecustomer_idincludestatustrial_atmau_exceededstorage_exceededbandwidth_exceeded' THEN
    RAISE EXCEPTION
      'si_customer_cover_uidx conflicts with the expected unique covering index: %',
      existing_definition;
  END IF;
END
$$;
