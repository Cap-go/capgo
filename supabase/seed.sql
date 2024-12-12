-- Create secrets
select
    vault.create_secret('["c591b04e-cf29-4945-b9a0-776d0672061a"]', 'admin_users', 'admins user id');
select vault.create_secret('http://172.17.0.1:54321', 'db_url', 'db url');
-- Netlify backend for long runny functions
select
    vault.create_secret('http://localhost:8881/.netlify/functions', 'netlify_function_url', 'Netlify function url');
-- Cloudflare backend for specific functions using CF features
select
    vault.create_secret('http://host.docker.internal:54321/functions/v1', 'cloudflare_function_url', 'Cloudflare function url');
select vault.create_secret('testsecret', 'apikey', 'admin user id');


-- Cron jobs for insights and plan
select
    cron.schedule('Update insights', '22 1 * * *', $$SELECT http_post_helper('logsnag_insights', 'cloudflare', '{}'::jsonb)$$);
SELECT cron.schedule('Update plan', '0 1 * * *', $$SELECT http_post_helper('cron_good_plan', '', '{}'::jsonb)$$);

-- Seed data
select reset_and_seed_data();
select reset_and_seed_stats_data();
