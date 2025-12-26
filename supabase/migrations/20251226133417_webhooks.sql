-- Webhooks System Migration
-- Allows organizations to receive HTTP notifications for events

-- =====================================================
-- TABLE: webhooks
-- Stores webhook endpoint configurations per organization
-- =====================================================
CREATE TABLE IF NOT EXISTS "public"."webhooks" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "org_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "enabled" BOOLEAN DEFAULT true NOT NULL,
  "events" TEXT[] NOT NULL,  -- ['app_versions', 'channels', 'org_users', 'orgs']
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "created_by" UUID,
  CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhooks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE,
  CONSTRAINT "webhooks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL
);

-- Indexes for efficient org lookups
CREATE INDEX IF NOT EXISTS "webhooks_org_id_idx" ON "public"."webhooks" ("org_id");
CREATE INDEX IF NOT EXISTS "webhooks_enabled_idx" ON "public"."webhooks" ("org_id", "enabled") WHERE "enabled" = true;

-- =====================================================
-- TABLE: webhook_deliveries
-- Stores delivery history for each webhook call (Stripe-like experience)
-- =====================================================
CREATE TABLE IF NOT EXISTS "public"."webhook_deliveries" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "webhook_id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "audit_log_id" BIGINT,  -- Reference to audit_logs (nullable for test events)
  "event_type" TEXT NOT NULL,  -- table_name.operation (e.g., 'app_versions.INSERT')
  "status" TEXT NOT NULL DEFAULT 'pending',  -- pending, success, failed
  "request_payload" JSONB NOT NULL,
  "response_status" INTEGER,
  "response_body" TEXT,
  "response_headers" JSONB,
  "attempt_count" INTEGER DEFAULT 0 NOT NULL,
  "max_attempts" INTEGER DEFAULT 3 NOT NULL,
  "next_retry_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "completed_at" TIMESTAMPTZ,
  "duration_ms" INTEGER,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE CASCADE,
  CONSTRAINT "webhook_deliveries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS "webhook_deliveries_webhook_id_idx" ON "public"."webhook_deliveries" ("webhook_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_org_id_created_idx" ON "public"."webhook_deliveries" ("org_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "webhook_deliveries_pending_retry_idx" ON "public"."webhook_deliveries" ("status", "next_retry_at") WHERE "status" = 'pending';

-- =====================================================
-- Enable RLS
-- =====================================================
ALTER TABLE "public"."webhooks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."webhook_deliveries" ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for webhooks table
-- =====================================================

-- Allow org members to view webhooks
CREATE POLICY "Allow org members to select webhooks"
  ON "public"."webhooks"
  FOR SELECT
  TO "authenticated"
  USING (
    "public"."check_min_rights"(
      'read'::"public"."user_min_right",
      (SELECT "public"."get_identity"()),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  );

-- Only admin/super_admin can create webhooks
CREATE POLICY "Allow admin to insert webhooks"
  ON "public"."webhooks"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    "public"."check_min_rights"(
      'admin'::"public"."user_min_right",
      (SELECT "public"."get_identity"()),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  );

-- Only admin/super_admin can update webhooks
CREATE POLICY "Allow admin to update webhooks"
  ON "public"."webhooks"
  FOR UPDATE
  TO "authenticated"
  USING (
    "public"."check_min_rights"(
      'admin'::"public"."user_min_right",
      (SELECT "public"."get_identity"()),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  )
  WITH CHECK (
    "public"."check_min_rights"(
      'admin'::"public"."user_min_right",
      (SELECT "public"."get_identity"()),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  );

-- Only admin/super_admin can delete webhooks
CREATE POLICY "Allow admin to delete webhooks"
  ON "public"."webhooks"
  FOR DELETE
  TO "authenticated"
  USING (
    "public"."check_min_rights"(
      'admin'::"public"."user_min_right",
      (SELECT "public"."get_identity"()),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  );

-- =====================================================
-- RLS Policies for webhook_deliveries table
-- =====================================================

-- Allow org members to view delivery logs
CREATE POLICY "Allow org members to select webhook_deliveries"
  ON "public"."webhook_deliveries"
  FOR SELECT
  TO "authenticated"
  USING (
    "public"."check_min_rights"(
      'read'::"public"."user_min_right",
      (SELECT "public"."get_identity"()),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  );

-- Only admin/super_admin can insert (for test events via API)
CREATE POLICY "Allow admin to insert webhook_deliveries"
  ON "public"."webhook_deliveries"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    "public"."check_min_rights"(
      'admin'::"public"."user_min_right",
      (SELECT "public"."get_identity"()),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  );

-- Only admin/super_admin can update (for retry functionality)
CREATE POLICY "Allow admin to update webhook_deliveries"
  ON "public"."webhook_deliveries"
  FOR UPDATE
  TO "authenticated"
  USING (
    "public"."check_min_rights"(
      'admin'::"public"."user_min_right",
      (SELECT "public"."get_identity"()),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  );

-- =====================================================
-- Service role policies (for triggers and background jobs)
-- =====================================================

-- Allow service role full access to webhooks
CREATE POLICY "Allow service_role full access to webhooks"
  ON "public"."webhooks"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- Allow service role full access to webhook_deliveries
CREATE POLICY "Allow service_role full access to webhook_deliveries"
  ON "public"."webhook_deliveries"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- PGMQ Queue for webhook delivery
-- =====================================================
SELECT pgmq.create('webhook_dispatcher');
SELECT pgmq.create('webhook_delivery');

-- =====================================================
-- Trigger function: Queue webhook on audit_log INSERT
-- =====================================================
CREATE OR REPLACE FUNCTION "public"."trigger_webhook_on_audit_log"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Queue the audit log event for webhook dispatch
  PERFORM pgmq.send(
    'webhook_dispatcher',
    jsonb_build_object(
      'function_name', 'webhook_dispatcher',
      'function_type', 'cloudflare',
      'payload', jsonb_build_object(
        'audit_log_id', NEW.id,
        'table_name', NEW.table_name,
        'operation', NEW.operation,
        'org_id', NEW.org_id,
        'record_id', NEW.record_id,
        'old_record', NEW.old_record,
        'new_record', NEW.new_record,
        'changed_fields', NEW.changed_fields,
        'user_id', NEW.user_id,
        'created_at', NEW.created_at
      )
    )
  );
  RETURN NEW;
END;
$$;

-- =====================================================
-- Create trigger on audit_logs table
-- Note: This will only work after audit_logs table is created
-- =====================================================
DO $$
BEGIN
  -- Check if audit_logs table exists before creating trigger
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    -- Drop trigger if exists to recreate
    DROP TRIGGER IF EXISTS "on_audit_log_webhook" ON "public"."audit_logs";

    -- Create the trigger
    CREATE TRIGGER "on_audit_log_webhook"
    AFTER INSERT ON "public"."audit_logs"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."trigger_webhook_on_audit_log"();
  END IF;
END
$$;

-- =====================================================
-- Updated_at trigger for webhooks
-- =====================================================
CREATE OR REPLACE FUNCTION "public"."update_webhook_updated_at"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "update_webhooks_updated_at"
BEFORE UPDATE ON "public"."webhooks"
FOR EACH ROW
EXECUTE FUNCTION "public"."update_webhook_updated_at"();

-- =====================================================
-- Cleanup function for old webhook deliveries (7 days)
-- =====================================================
CREATE OR REPLACE FUNCTION "public"."cleanup_webhook_deliveries"()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM "public"."webhook_deliveries"
  WHERE "created_at" < NOW() - INTERVAL '7 days';
END;
$$;

-- =====================================================
-- Grant permissions
-- =====================================================

-- Webhooks table grants
GRANT ALL ON TABLE "public"."webhooks" TO "anon";
GRANT ALL ON TABLE "public"."webhooks" TO "authenticated";
GRANT ALL ON TABLE "public"."webhooks" TO "service_role";

-- Webhook deliveries table grants
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "service_role";

-- Function grants
GRANT ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_webhook_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() TO "service_role";

-- =====================================================
-- Add webhook_dispatcher and webhook_delivery to CRON processing
-- This modifies the process_all_cron_tasks function to include webhook queues
-- =====================================================
-- Note: The actual CRON modification should be done in a separate step
-- after the queue_consumer is set up to handle these queues
