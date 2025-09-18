alter table public.users
drop column if exists "customer_id";

alter table public.users
drop column if exists "billing_email";
