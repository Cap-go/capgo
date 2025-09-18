-- Rename notification settings columns to snake_case, drop legacy legal flag,
-- and ensure defaults align with the new onboarding flow.
alter table public.users
  rename column "enableNotifications" to enable_notifications;

alter table public.users
  rename column "optForNewsletters" to opt_for_newsletters;

alter table public.users
  alter column enable_notifications set default true;

alter table public.users
  alter column opt_for_newsletters set default true;

update public.users
  set enable_notifications = true
  where enable_notifications is distinct from true;

update public.users
  set opt_for_newsletters = true
  where opt_for_newsletters is distinct from true;

alter table public.users
  drop column if exists "legalAccepted";

update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'activation'
  where raw_user_meta_data ? 'activation';

update auth.users
  set raw_user_meta_data = '{}'::jsonb
  where raw_user_meta_data is null;
