-- Make RBAC the default for all newly created organizations.
-- Existing orgs are not affected (their current use_new_rbac value is preserved).
ALTER TABLE public.orgs ALTER COLUMN use_new_rbac SET DEFAULT true;
