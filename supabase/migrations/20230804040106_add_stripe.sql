-- create extension if not exists wrappers;

-- create foreign data wrapper stripe_wrapper
--   handler stripe_fdw_handler
--   validator stripe_fdw_validator;

-- create server stripe_server
--   foreign data wrapper stripe_wrapper
--   options (
--     api_key '<Stripe API Key>'  -- Stripe API key, required
--   );

-- create schema stripe;

-- create foreign table stripe.accounts (
--   id text,
--   business_type text,
--   country text,
--   email text,
--   type text,
--   created timestamp,
--   attrs jsonb
-- )
--   server stripe_server
--   options (
--     object 'accounts'
--   );

-- create foreign table stripe.customers (
--   id text,
--   email text,
--   name text,
--   description text,
--   created timestamp,
--   attrs jsonb
-- )
--   server stripe_server
--   options (
--     object 'customers',
--     rowid_column 'id'
--   );

-- create foreign table stripe.prices (
--   id text,
--   active bool,
--   currency text,
--   product text,
--   unit_amount bigint,
--   type text,
--   created timestamp,
--   attrs jsonb
-- )
--   server stripe_server
--   options (
--     object 'pricing'
--   );

-- create foreign table stripe.products (
--   id text,
--   name text,
--   active bool,
--   default_price text,
--   description text,
--   created timestamp,
--   updated timestamp,
--   attrs jsonb
-- )
--   server stripe_server
--   options (
--     object 'products',
--     rowid_column 'id'
--   );

-- create foreign table stripe.subscriptions (
--   id text,
--   customer text,
--   currency text,
--   current_period_start timestamp,
--   current_period_end timestamp,
--   attrs jsonb
-- )
--   server stripe_server
--   options (
--     object 'subscriptions',
--     rowid_column 'id'
--   );

-- -- select * from stripe.customers limit 10; -- test query
