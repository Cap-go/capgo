#!/bin/bash
# Verify SSO routes are correctly registered

echo "Checking Supabase function routes..."
grep -n "route('/sso/" supabase/functions/private/index.ts

echo ""
echo "Checking Cloudflare worker routes..."
grep -n "route('/sso/" cloudflare_workers/api/index.ts

echo ""
echo "Expected routes:"
echo "  /private/sso/configure (POST)"
echo "  /private/sso/update (PUT)"
echo "  /private/sso/remove (DELETE)"
echo "  /private/sso/status (GET)"
echo "  /private/sso/test (POST)"
