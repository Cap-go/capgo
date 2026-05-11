CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_owner_org_app_id
ON public.apps (owner_org, app_id);

CREATE TABLE IF NOT EXISTS public.notification_provider_configs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  owner_org uuid NOT NULL,
  app_id character varying(50) NOT NULL,
  provider text NOT NULL,
  status text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  secret_ref text,
  created_by uuid,
  CONSTRAINT notification_provider_configs_pkey PRIMARY KEY (id),
  CONSTRAINT notification_provider_configs_app_provider_key UNIQUE (app_id, provider),
  CONSTRAINT notification_provider_configs_provider_check CHECK (provider IN ('fcm', 'apns')),
  CONSTRAINT notification_provider_configs_status_check CHECK (status IN ('draft', 'configured', 'disabled', 'error')),
  CONSTRAINT notification_provider_configs_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE,
  CONSTRAINT notification_provider_configs_owner_org_app_id_fkey FOREIGN KEY (owner_org, app_id) REFERENCES public.apps(owner_org, app_id) ON DELETE CASCADE,
  CONSTRAINT notification_provider_configs_owner_org_fkey FOREIGN KEY (owner_org) REFERENCES public.orgs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_provider_configs_app
ON public.notification_provider_configs (app_id);

CREATE INDEX IF NOT EXISTS idx_notification_provider_configs_owner_org
ON public.notification_provider_configs (owner_org);

CREATE TABLE IF NOT EXISTS public.notification_app_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  owner_org uuid NOT NULL,
  app_id character varying(50) NOT NULL,
  push_update_enabled boolean DEFAULT false NOT NULL,
  push_update_install_mode text DEFAULT 'next'::text NOT NULL,
  push_update_channel text,
  created_by uuid,
  CONSTRAINT notification_app_settings_pkey PRIMARY KEY (id),
  CONSTRAINT notification_app_settings_app_key UNIQUE (app_id),
  CONSTRAINT notification_app_settings_install_mode_check CHECK (push_update_install_mode IN ('next', 'set')),
  CONSTRAINT notification_app_settings_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE,
  CONSTRAINT notification_app_settings_owner_org_app_id_fkey FOREIGN KEY (owner_org, app_id) REFERENCES public.apps(owner_org, app_id) ON DELETE CASCADE,
  CONSTRAINT notification_app_settings_owner_org_fkey FOREIGN KEY (owner_org) REFERENCES public.orgs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_app_settings_owner_org
ON public.notification_app_settings (owner_org);

CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  owner_org uuid NOT NULL,
  app_id character varying(50) NOT NULL,
  name text NOT NULL,
  kind text DEFAULT 'alert'::text NOT NULL,
  status text NOT NULL,
  audience jsonb DEFAULT '{}'::jsonb NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  scheduled_at timestamp with time zone,
  queued_at timestamp with time zone,
  completed_at timestamp with time zone,
  counters jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid,
  CONSTRAINT notification_campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT notification_campaigns_kind_check CHECK (kind IN ('alert', 'background', 'badge', 'update_check')),
  CONSTRAINT notification_campaigns_status_check CHECK (status IN ('draft', 'scheduled', 'queued', 'sending', 'sent', 'paused', 'failed', 'cancelled')),
  CONSTRAINT notification_campaigns_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE,
  CONSTRAINT notification_campaigns_owner_org_app_id_fkey FOREIGN KEY (owner_org, app_id) REFERENCES public.apps(owner_org, app_id) ON DELETE CASCADE,
  CONSTRAINT notification_campaigns_owner_org_fkey FOREIGN KEY (owner_org) REFERENCES public.orgs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_app_created
ON public.notification_campaigns (app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_owner_org
ON public.notification_campaigns (owner_org);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status_scheduled
ON public.notification_campaigns (status, scheduled_at)
WHERE status IN ('scheduled', 'queued');

ALTER TABLE public.notification_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all notification provider config access"
ON public.notification_provider_configs
AS RESTRICTIVE
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny all notification app settings access"
ON public.notification_app_settings
AS RESTRICTIVE
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny all notification campaign access"
ON public.notification_campaigns
AS RESTRICTIVE
FOR ALL
USING (false)
WITH CHECK (false);

REVOKE ALL ON public.notification_provider_configs FROM PUBLIC;
REVOKE ALL ON public.notification_provider_configs FROM anon;
REVOKE ALL ON public.notification_provider_configs FROM authenticated;
GRANT ALL ON public.notification_provider_configs TO service_role;

REVOKE ALL ON public.notification_app_settings FROM PUBLIC;
REVOKE ALL ON public.notification_app_settings FROM anon;
REVOKE ALL ON public.notification_app_settings FROM authenticated;
GRANT ALL ON public.notification_app_settings TO service_role;

REVOKE ALL ON public.notification_campaigns FROM PUBLIC;
REVOKE ALL ON public.notification_campaigns FROM anon;
REVOKE ALL ON public.notification_campaigns FROM authenticated;
GRANT ALL ON public.notification_campaigns TO service_role;

COMMENT ON TABLE public.notification_provider_configs IS 'Low-cardinality native notification provider configuration. Per-device push tokens are stored only as encrypted Cloudflare Analytics Engine events, not in Postgres.';
COMMENT ON TABLE public.notification_campaigns IS 'Low-cardinality native notification campaign control plane. Fanout state and delivery receipts are stored in Cloudflare Queues/Analytics Engine, not per-device Postgres rows.';
COMMENT ON TABLE public.notification_app_settings IS 'Low-cardinality native notification app settings, including whether Capgo can send silent push update checks. Device state remains in Cloudflare Analytics Engine.';
