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

-- Create cron jobs
-- Set old versions to deleted after retention passed 
select
    cron.schedule('Delete old app version', '40 0 * * *', $$CALL update_app_versions_retention()$$);
-- update channel for progressive deploy if too many fail
select
    cron.schedule('Update channel for progressive deploy if too many fail', '*/10 * * * *', $$CALL update_channels_progressive_deploy()$$);
select
    cron.schedule('Update insights', '22 1 * * *', $$SELECT http_post_helper('logsnag_insights', 'cloudflare', '{}'::jsonb)$$);
-- SELECT cron.schedule('Update plan', '0 1 * * *', $$SELECT http_post_helper('cron_good_plan', '', '{}'::jsonb)$$);
select
    cron.schedule('Send stats email every week', '0 12 * * 6', $$SELECT http_post_helper('cron_email', 'cloudflare', '{}'::jsonb)$$);

select reset_and_seed_data();
select reset_and_seed_stats_data();
