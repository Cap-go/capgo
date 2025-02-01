-- Create the capgo_tokens_history table
CREATE TABLE IF NOT EXISTS capgo_tokens_history (
    id BIGSERIAL PRIMARY KEY,
    sum INTEGER NOT NULL,
    reason TEXT NOT NULL,
    org_id UUID NOT NULL REFERENCES orgs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add a comment to the table
COMMENT ON TABLE capgo_tokens_history IS 'Table to track token transactions for organizations';

-- Add comments to the columns
COMMENT ON COLUMN capgo_tokens_history.id IS 'The unique identifier for the token transaction';
COMMENT ON COLUMN capgo_tokens_history.sum IS 'The amount of tokens (positive for additions, negative for deductions)';
COMMENT ON COLUMN capgo_tokens_history.reason IS 'The reason for the token transaction';
COMMENT ON COLUMN capgo_tokens_history.org_id IS 'Reference to the organization this transaction belongs to';
COMMENT ON COLUMN capgo_tokens_history.created_at IS 'Timestamp when the token transaction was created';
COMMENT ON COLUMN capgo_tokens_history.updated_at IS 'Timestamp when the token transaction was last updated';

-- Create an index on org_id for faster lookups
CREATE INDEX capgo_tokens_history_org_id_idx ON capgo_tokens_history(org_id);

-- Create an index on created_at for time-based queries
CREATE INDEX capgo_tokens_history_created_at_idx ON capgo_tokens_history(created_at DESC);

-- Create trigger for updating updated_at column
CREATE TRIGGER handle_updated_at 
    BEFORE UPDATE ON capgo_tokens_history
    FOR EACH ROW 
    EXECUTE FUNCTION extensions.moddatetime('updated_at');

ALTER TABLE capgo_tokens_history ENABLE ROW LEVEL SECURITY;

-- Function to get token history for an organization
CREATE OR REPLACE FUNCTION get_tokens_history(orgid UUID)
RETURNS TABLE (
    id BIGINT,
    sum INTEGER,
    reason TEXT,
    created_at TIMESTAMPTZ,
    running_total BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    has_admin_access BOOLEAN;
BEGIN
    -- Check if user has admin access to the organization
    SELECT check_min_rights('admin'::user_min_right, get_identity_org_allowed('{write,all,upload,read}'::key_mode[], orgid), orgid, NULL::character varying, NULL::bigint)
    INTO has_admin_access;

    -- If no admin access, raise exception
    IF NOT has_admin_access THEN
        RAISE EXCEPTION 'Insufficient permissions to view token history';
    END IF;

    RETURN QUERY
    WITH running_totals AS (
        SELECT 
            ct.id,
            ct.sum,
            ct.reason,
            ct.created_at,
            SUM(ct.sum) OVER (ORDER BY ct.created_at, ct.id) as running_total
        FROM capgo_tokens_history ct
        WHERE ct.org_id = orgid
        AND ct.created_at >= NOW() - INTERVAL '1 year'
    )
    SELECT 
        rt.id,
        rt.sum,
        rt.reason,
        rt.created_at,
        rt.running_total
    FROM running_totals rt
    ORDER BY rt.created_at ASC, rt.id ASC;
END;
$$;

-- Create the capgo_tokens_steps table
CREATE TABLE IF NOT EXISTS capgo_tokens_steps (
    id BIGSERIAL PRIMARY KEY,
    step_min INTEGER NOT NULL,
    step_max INTEGER NOT NULL,
    price_per_unit FLOAT NOT NULL,
    price_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT step_range_check CHECK (step_min < step_max)
);

-- Add a comment to the table
COMMENT ON TABLE capgo_tokens_steps IS 'Table to store token pricing tiers';

-- Add comments to the columns
COMMENT ON COLUMN capgo_tokens_steps.id IS 'The unique identifier for the pricing tier';
COMMENT ON COLUMN capgo_tokens_steps.step_min IS 'The minimum number of tokens for this tier';
COMMENT ON COLUMN capgo_tokens_steps.step_max IS 'The maximum number of tokens for this tier';
COMMENT ON COLUMN capgo_tokens_steps.price_per_unit IS 'The price per token in this tier';
COMMENT ON COLUMN capgo_tokens_steps.price_id IS 'The Stripe price ID associated with this tier';
COMMENT ON COLUMN capgo_tokens_steps.created_at IS 'Timestamp when the tier was created';
COMMENT ON COLUMN capgo_tokens_steps.updated_at IS 'Timestamp when the tier was last updated';

-- Create trigger for updating updated_at column
CREATE TRIGGER handle_updated_at 
    BEFORE UPDATE ON capgo_tokens_steps
    FOR EACH ROW 
    EXECUTE FUNCTION extensions.moddatetime('updated_at');

-- Create an index on step ranges for faster lookups
CREATE INDEX capgo_tokens_steps_range_idx ON capgo_tokens_steps(step_min, step_max);

ALTER TABLE capgo_tokens_steps ENABLE ROW LEVEL SECURITY;
-- Allow anyone to read capgo_tokens_steps
CREATE POLICY "Anyone can read capgo_tokens_steps" ON capgo_tokens_steps
    FOR SELECT
    TO public
    USING (true);

