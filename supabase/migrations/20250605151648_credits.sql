CREATE TABLE IF NOT EXISTS capgo_credits_steps (
  id BIGSERIAL PRIMARY KEY,
  step_min bigint NOT NULL,
  step_max bigint NOT NULL,
  price_per_unit FLOAT NOT NULL,
  type TEXT NOT NULL,
  unit_factor BIGINT NOT NULL DEFAULT 1,
  stripe_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT step_range_check CHECK (step_min < step_max)
);

-- Add a comment to the table
COMMENT ON TABLE capgo_credits_steps IS 'Table to store token pricing tiers';

-- Add comments to the columns
COMMENT ON COLUMN capgo_credits_steps.id IS 'The unique identifier for the pricing tier';

COMMENT ON COLUMN capgo_credits_steps.step_min IS 'The minimum number of credits for this tier';

COMMENT ON COLUMN capgo_credits_steps.step_max IS 'The maximum number of credits for this tier';

COMMENT ON COLUMN capgo_credits_steps.price_per_unit IS 'The price per token in this tier';

COMMENT ON COLUMN capgo_credits_steps.unit_factor IS 'The unit conversion factor (e.g., bytes to GB = 1073741824)';

COMMENT ON COLUMN capgo_credits_steps.created_at IS 'Timestamp when the tier was created';

COMMENT ON COLUMN capgo_credits_steps.updated_at IS 'Timestamp when the tier was last updated';

-- Create trigger for updating updated_at column
CREATE TRIGGER handle_updated_at BEFORE
UPDATE ON capgo_credits_steps FOR EACH ROW
EXECUTE FUNCTION extensions.moddatetime ('updated_at');

-- Create an index on step ranges for faster lookups
CREATE INDEX capgo_credits_steps_range_idx ON capgo_credits_steps (step_min, step_max);

ALTER TABLE capgo_credits_steps ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read capgo_credits_steps
CREATE POLICY "Anyone can read capgo_credits_steps" ON capgo_credits_steps FOR
SELECT
  TO public USING (true);
