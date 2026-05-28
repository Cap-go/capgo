CREATE INDEX IF NOT EXISTS ON public.audit_logs USING btree (record_id);

CREATE INDEX IF NOT EXISTS ON public.apps USING btree (default_upload_channel);

CREATE INDEX IF NOT EXISTS ON public.usage_credit_transactions USING btree (org_id);

CREATE INDEX IF NOT EXISTS ON public.usage_overage_events USING btree (org_id);
