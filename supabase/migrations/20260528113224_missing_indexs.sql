CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON public.audit_logs USING btree (record_id);

CREATE INDEX IF NOT EXISTS idx_apps_default_upload_channel ON public.apps USING btree (default_upload_channel);

CREATE INDEX IF NOT EXISTS idx_usage_credit_transactions_org_id ON public.usage_credit_transactions USING btree (org_id);

CREATE INDEX IF NOT EXISTS idx_usage_overage_events_org_id ON public.usage_overage_events USING btree (org_id);
