-- Add index for customer lookups
CREATE INDEX IF NOT EXISTS idx_stripe_info_customer_id ON stripe_info(customer_id);
CREATE INDEX IF NOT EXISTS idx_orgs_customer_id ON orgs(customer_id);

-- Add compound index for common filter conditions
CREATE INDEX IF NOT EXISTS idx_stripe_info_status_plan ON stripe_info(status, is_good_plan) 
WHERE status = 'succeeded' AND is_good_plan = true;

-- Add index for trial date checks
CREATE INDEX IF NOT EXISTS idx_stripe_info_trial ON stripe_info(trial_at) 
WHERE trial_at IS NOT NULL;
