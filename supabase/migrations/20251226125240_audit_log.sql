-- Audit Log Table for tracking CRUD operations
-- Tables tracked: orgs, channels, app_versions, org_users

-- Create the audit_logs table
CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "table_name" TEXT NOT NULL,
  "record_id" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "user_id" UUID,
  "org_id" UUID NOT NULL,
  "old_record" JSONB,
  "new_record" JSONB,
  "changed_fields" TEXT[]
);

-- Add comments
COMMENT ON TABLE "public"."audit_logs" IS 'Audit log for tracking changes to orgs, channels, app_versions, and org_users tables';
COMMENT ON COLUMN "public"."audit_logs"."table_name" IS 'Name of the table that was modified (orgs, channels, app_versions, org_users)';
COMMENT ON COLUMN "public"."audit_logs"."record_id" IS 'Primary key of the affected record';
COMMENT ON COLUMN "public"."audit_logs"."operation" IS 'Type of operation: INSERT, UPDATE, or DELETE';
COMMENT ON COLUMN "public"."audit_logs"."user_id" IS 'User who made the change (from auth.uid())';
COMMENT ON COLUMN "public"."audit_logs"."org_id" IS 'Organization context for filtering';
COMMENT ON COLUMN "public"."audit_logs"."old_record" IS 'Previous state of the record (null for INSERT)';
COMMENT ON COLUMN "public"."audit_logs"."new_record" IS 'New state of the record (null for DELETE)';
COMMENT ON COLUMN "public"."audit_logs"."changed_fields" IS 'Array of field names that changed (for UPDATE operations)';

-- Create indexes for efficient querying
CREATE INDEX idx_audit_logs_org_id ON "public"."audit_logs"("org_id");
CREATE INDEX idx_audit_logs_table_name ON "public"."audit_logs"("table_name");
CREATE INDEX idx_audit_logs_user_id ON "public"."audit_logs"("user_id");
CREATE INDEX idx_audit_logs_created_at ON "public"."audit_logs"("created_at" DESC);
CREATE INDEX idx_audit_logs_org_created ON "public"."audit_logs"("org_id", "created_at" DESC);
CREATE INDEX idx_audit_logs_operation ON "public"."audit_logs"("operation");

-- Create the audit trigger function
CREATE OR REPLACE FUNCTION "public"."audit_log_trigger"()
RETURNS TRIGGER AS $$
DECLARE
  v_old_record JSONB;
  v_new_record JSONB;
  v_changed_fields TEXT[];
  v_org_id UUID;
  v_record_id TEXT;
  v_user_id UUID;
  v_key TEXT;
BEGIN
  -- Get current user from auth context
  v_user_id := auth.uid();

  -- Convert records to JSONB based on operation type
  IF TG_OP = 'DELETE' THEN
    v_old_record := to_jsonb(OLD);
    v_new_record := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := to_jsonb(NEW);
  ELSE -- UPDATE
    v_old_record := to_jsonb(OLD);
    v_new_record := to_jsonb(NEW);

    -- Calculate changed fields by comparing old and new values
    FOR v_key IN SELECT jsonb_object_keys(v_new_record)
    LOOP
      IF v_old_record->v_key IS DISTINCT FROM v_new_record->v_key THEN
        v_changed_fields := array_append(v_changed_fields, v_key);
      END IF;
    END LOOP;
  END IF;

  -- Get org_id and record_id based on table being modified
  CASE TG_TABLE_NAME
    WHEN 'orgs' THEN
      v_org_id := COALESCE(NEW.id, OLD.id);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'channels' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'app_versions' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'org_users' THEN
      v_org_id := COALESCE(NEW.org_id, OLD.org_id);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    ELSE
      -- Fallback for any other table (shouldn't happen with current triggers)
      v_org_id := NULL;
      v_record_id := NULL;
  END CASE;

  -- Only insert if we have a valid org_id
  IF v_org_id IS NOT NULL THEN
    INSERT INTO "public"."audit_logs" (
      table_name, record_id, operation, user_id, org_id,
      old_record, new_record, changed_fields
    ) VALUES (
      TG_TABLE_NAME, v_record_id, TG_OP, v_user_id, v_org_id,
      v_old_record, v_new_record, v_changed_fields
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach triggers to tracked tables

-- Orgs audit trigger
CREATE TRIGGER audit_orgs_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "public"."orgs"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();

-- Channels audit trigger
CREATE TRIGGER audit_channels_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "public"."channels"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();

-- App versions audit trigger
CREATE TRIGGER audit_app_versions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "public"."app_versions"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();

-- Org users audit trigger
CREATE TRIGGER audit_org_users_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "public"."org_users"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();

-- Enable Row Level Security
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only super_admins can view audit logs for their organizations
CREATE POLICY "Super admins can view audit logs for their orgs"
  ON "public"."audit_logs"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "public"."org_users" ou
      WHERE ou.org_id = audit_logs.org_id
        AND ou.user_id = auth.uid()
        AND ou.user_right = 'super_admin'
    )
  );

-- No INSERT/UPDATE/DELETE policies - only triggers can write to this table

-- Cleanup function for 90-day retention
CREATE OR REPLACE FUNCTION "public"."cleanup_old_audit_logs"()
RETURNS void AS $$
BEGIN
  DELETE FROM "public"."audit_logs"
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule daily cleanup at 3 AM UTC
SELECT cron.schedule(
  'cleanup-audit-logs',
  '0 3 * * *',
  $$SELECT "public"."cleanup_old_audit_logs"()$$
);
