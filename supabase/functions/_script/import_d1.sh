export SUPABASE_URL='INSERT_HERE_REMOTE_SUPABASE_CONNECTION_STRING'
export D1_CF_APIKEY="tY3kOn-S14n--hT34UnR5nynq4XfPaJK0f7bAXht"
export D1_URL="https://api.cloudflare.com/client/v4/accounts/9ee3d7479a3c359681e3fab2c8cb22c0/d1/database/8361491c-b4e0-41e6-a24a-d69892e248dd/query"
deno run --allow-all supabase/functions/_script/duplicate_in_d1.ts
