ALTER TABLE public.stats ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'app_crash';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'app_crash_native';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'app_anr';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'app_killed_low_memory';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'app_killed_excessive_resource_usage';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'app_initialization_failure';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'app_memory_warning';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'webview_javascript_error';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'webview_unhandled_rejection';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'webview_resource_error';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'webview_security_policy_violation';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'webview_unclean_restart';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'webview_render_process_gone';
ALTER TYPE public.stats_action ADD VALUE IF NOT EXISTS 'webview_content_process_terminated';
