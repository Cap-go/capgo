select vault.create_secret('["c591b04e-cf29-4945-b9a0-776d0672061a"]', 'admin_users', 'admins user id');
select vault.create_secret('http://172.17.0.1:54321', 'db_url', 'db url');
select vault.create_secret('http://localhost:8881/.netlify/functions/', 'netlify_function_url', 'Netlify function url'); -- Netlify backend for long runny functions
select vault.create_secret('http://localhost:7777/', 'cf_function_url', 'Cloudflare function url'); -- Cloudflare backend for specific functions using CF features
select vault.create_secret('testsecret', 'apikey', 'admin user id');

SELECT reset_and_seed_data();
