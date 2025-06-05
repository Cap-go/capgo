CREATE TABLE IF NOT EXISTS capgo_credits_steps (
  id BIGSERIAL PRIMARY KEY,
  step_min bigint NOT NULL,
  step_max bigint NOT NULL,
  price_per_unit FLOAT NOT NULL,
  type TEXT NOT NULL,
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

INSERT INTO
  capgo_credits_steps (type, step_min, step_max, price_per_unit)
VALUES
  ('mau', 0, 1000000, 0.003),
  ('mau', 1000000, 3000000, 0.0022),
  ('mau', 3000000, 10000000, 0.0016),
  ('mau', 10000000, 15000000, 0.0014),
  ('mau', 15000000, 25000000, 0.00115),
  ('mau', 25000000, 40000000, 0.001),
  ('mau', 40000000, 100000000, 0.0009),
  ('mau', 100000000, 9223372036854775807, 0.0007),
  ('bandwidth', 0, 1374000000000, 0.12), -- 0–10 TB
  ('bandwidth', 1374000000000, 2749000000000, 0.10), -- 10–20 TB
  ('bandwidth', 2749000000000, 6872000000000, 0.085), -- 20–50 TB
  ('bandwidth', 6872000000000, 13740000000000, 0.07), -- 50–100 TB
  (
    'bandwidth',
    13740000000000,
    27490000000000,
    0.055
  ), -- 100–200 TB
  ('bandwidth', 27490000000000, 68720000000000, 0.04), -- 200–500 TB
  (
    'bandwidth',
    68720000000000,
    137400000000000,
    0.03
  ), -- 500–1000 TB
  (
    'bandwidth',
    137400000000000,
    9223372036854775807,
    0.02
  ), -- 1000+ TB
  ('storage', 0, 1342000000, 0.09), -- 0–10 GB
  ('storage', 1342000000, 6711000000, 0.08), -- 10–50 GB
  ('storage', 6711000000, 26840000000, 0.065), -- 50–200 GB
  ('storage', 26840000000, 67110000000, 0.05), -- 200–500 GB
  ('storage', 67110000000, 268400000000, 0.04), -- 500–2000 GB
  ('storage', 268400000000, 687200000000, 0.03), -- 2–5 TB
  ('storage', 687200000000, 1374000000000, 0.025), -- 5–10 TB
  (
    'storage',
    1374000000000,
    9223372036854775807,
    0.021
  );

-- 10+ TB
