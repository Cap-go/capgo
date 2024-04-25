select vault.create_secret('["c591b04e-cf29-4945-b9a0-776d0672061a"]', 'admin_users', 'admins user id');
select vault.create_secret('http://172.17.0.1:54321', 'db_url', 'db url');
select vault.create_secret('http://localhost:8881/.netlify/functions/', 'netlify_function_url', 'Netlify function url'); -- Netlify backend for long runny functions
select vault.create_secret('http://localhost:7777/', 'cf_function_url', 'Cloudflare function url'); -- Cloudflare backend for specific functions using CF features
select vault.create_secret('testsecret', 'apikey', 'admin user id');

-- Create cron jobs
-- Set old versions to deleted after retention passed 
SELECT cron.schedule('Delete old app version', '40 0 * * *', $$CALL update_app_versions_retention()$$);
-- update channel for progressive deploy if too many fail
SELECT cron.schedule('Update channel for progressive deploy if too many fail', '*/10 * * * *', $$CALL update_channels_progressive_deploy()$$);
SELECT cron.schedule('Update insights', '22 1 * * *', $$SELECT http_post_helper('logsnag_insights', '', '{}'::jsonb)$$);
SELECT cron.schedule('Update plan', '0 1 * * *', $$SELECT http_post_helper('cron_good_plan', '', '{}'::jsonb)$$);
SELECT cron.schedule('Send stats email every week', '0 12 * * 6', $$SELECT http_post_helper('cron_email', '', '{}'::jsonb)$$);

SELECT reset_and_seed_data();
