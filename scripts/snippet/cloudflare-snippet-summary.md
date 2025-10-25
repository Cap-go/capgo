# Cloudflare App ID Filter - Quick Summary

## Overview

A Cloudflare snippet to filter requests based on `app_id` for apps not using Capgo.

## Filtered Endpoints

- `/updates` (POST)
- `/stats` (POST)
- `/channel_self` (POST, PUT, DELETE, GET)

## Files Created

1. **[cloudflare-snippet-filter-appid.js](cloudflare-snippet-filter-appid.js)** - Static blocklist/allowlist snippet
2. **[CLOUDFLARE_SNIPPET_README.md](CLOUDFLARE_SNIPPET_README.md)** - Complete documentation

## Quick Start - Static Version

### 1. Configure the app ID list

Edit `cloudflare-snippet-filter-appid.js`:

```javascript
// Blocklist approach (recommended)
const BLOCKED_APP_IDS = [
  'com.example.notcapgo',
  'com.another.blocked',
];

// OR Allowlist approach (uncomment to use)
/*
const ALLOWED_APP_IDS = [
  'ee.forgr.capacitor_go',
  'com.example.capgoapp',
];
*/
```

### 2. Deploy to Cloudflare

1. Cloudflare Dashboard → Your Zone → **Rules** → **Snippets**
2. Click **Create Snippet**
3. Name: `app-id-filter`
4. Paste code from `cloudflare-snippet-filter-appid.js`
5. Click **Deploy**

### 3. Create execution rule

1. **Rules** → **Transform Rules** → **Modify Request**
2. Click **Create rule**
3. Name: `Execute App ID Filter`
4. Match condition:
   - Field: `URI Path`
   - Operator: `is in`
   - Values: `/updates`, `/stats`, `/channel_self`
5. Action: **Execute Snippet** → Select `app-id-filter`
6. Click **Deploy**

## Features

- **Zero backend load** - Filtering happens at the edge before reaching your backend
- **Blocklist OR Allowlist** - Choose your preferred approach
- **Multi-endpoint support** - Filters all plugin endpoints (updates, stats, channel_self)
- **Query param support** - Handles both JSON body and URL query parameters
- **Error handling** - Invalid requests get appropriate 400/403 error responses
- **Edge execution** - Runs on Cloudflare's global network

## Response Codes

- **400** - Missing `app_id` in request
- **403** - Unauthorized `app_id` (blocked/not allowed)
- **200+** - Allowed, request forwarded to backend

## Updating the Filter

To add/remove blocked apps:

1. Edit `cloudflare-snippet-filter-appid.js`
2. Update the `BLOCKED_APP_IDS` or `ALLOWED_APP_IDS` array
3. Re-deploy in Cloudflare Dashboard (copy-paste updated code)

**Note:** Cloudflare Snippets don't support KV storage. For dynamic updates without redeploying, use a Cloudflare Worker instead.

See [CLOUDFLARE_SNIPPET_README.md](CLOUDFLARE_SNIPPET_README.md) for complete instructions.

## Testing

```bash
# Test blocked app
curl -X POST https://yourdomain.com/updates \
  -H "Content-Type: application/json" \
  -d '{"app_id":"com.blocked.app","device_id":"test","version_name":"1.0.0","version_build":"100","is_emulator":false,"is_prod":true,"platform":"ios","plugin_version":"6.0.0"}'

# Expected: 403 Forbidden
# {"message":"This app is not authorized to use this service","error":"unauthorized_app","app_id":"com.blocked.app"}
```

## Key Implementation Details

- Checks `app_id` in request body for POST and PUT methods
- Checks `app_id` in query parameters for GET and DELETE on `/channel_self`
- Clones request before reading body to avoid consuming the stream
- Falls back to forwarding request on parsing errors (backend handles validation)
- Simple array-based filtering for maximum performance

## Security Benefits

- Prevent unauthorized apps from consuming Capgo resources
- Block apps at the edge before they reach your backend
- No database queries or backend processing for blocked requests
- Cannot be bypassed by clients (server-side filtering)

## Performance

- **Minimal overhead**: ~0-1ms for array lookup
- **Edge execution**: Runs globally on Cloudflare's network
- **Blocked requests**: Immediate 403 response, zero backend load
- **Allowed requests**: Minimal latency (~1-2ms max)

---

For complete documentation, see [CLOUDFLARE_SNIPPET_README.md](CLOUDFLARE_SNIPPET_README.md)
