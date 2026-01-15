# Debugging the Email Worker

The worker now has comprehensive debug logging to help troubleshoot issues.

## How to View Logs

```bash
# Tail production logs in real-time
wrangler tail --env prod

# Tail with filtering
wrangler tail --env prod --format pretty

# Tail with specific search term
wrangler tail --env prod --search "ERROR"
```

## Log Sections

The worker logs are organized with emoji prefixes for easy scanning:

### 📧 Email Reception

```
====================================
📧 EMAIL WORKER: Email received
====================================
```

Shows when an email is first received by the worker.

### 📨 Raw Email Metadata

```
📨 Raw email metadata: {
  from: "sender@example.com",
  to: "support@usecapgo.com",
  subject: "Help with...",
  rawSize: 1234,
  headerKeys: ["from", "to", "subject", ...]
}
```

Shows the raw email data received from Cloudflare.

### 🔍 Email Parsing

```
🔍 Parsing email...
✅ Email parsed: {
  from: { email: "...", name: "..." },
  to: "...",
  subject: "...",
  messageId: "...",
  inReplyTo: "...",
  hasBody: true,
  bodyTextLength: 234
}
```

Shows how the email was parsed.

### 🔗 Thread Detection

```
🔗 Thread detection: {
  isReply: false,
  threadId: null,
  inReplyTo: undefined,
  referencesCount: 0
}
```

Shows whether the email is a new thread or a reply.

### 🤖 AI Classification

```
🧠 classifyEmail: Starting AI classification...
   Anthropic API key present: true
   Anthropic API key length: 108
   Prompt length: 456 characters
🌐 Calling Anthropic API...
📡 Anthropic API response status: 200
✅ Claude response received: "support|0.95|Customer reporting a bug"
📊 Parsed classification result: {
  category: "support",
  confidence: 0.95,
  shouldProcess: true,
  reason: "Customer reporting a bug"
}
```

Shows the AI classification process.

### 📝 New Email Handling

```
📝 handleNewEmail: Creating Discord thread
   Category: support
   Prefix: "[SUPPORT] "
   Subject: "Help with..."
   From: sender@example.com
```

Shows when a new Discord thread is being created.

### 🟣 Discord Thread Creation

```
🟣 createForumThread: Starting...
   Forum Channel ID: 123456789
   Bot Token present: true
   Bot Token length: 72
   Discord API URL: https://discord.com/api/v10/channels/123456789/threads
   Message content length: 345
   Number of embeds: 1
   Thread name: "[SUPPORT] Help with..."
   Truncated name: "[SUPPORT] Help with..."
   Payload size: 678 bytes
🌐 Sending request to Discord API...
📡 Discord API response status: 201 Created
✅ Discord thread created successfully!
   Thread ID: 987654321
   Thread name: "[SUPPORT] Help with..."
```

Shows the Discord API interaction in detail.

### ✅ Success

```
====================================
✅ EMAIL WORKER: Processing complete
====================================
```

Shows when the worker finished successfully.

### ❌ Errors

```
❌ ERROR processing email: TypeError: Cannot read property 'x' of undefined
Error stack: ...
====================================
```

Shows any errors that occurred.

## Common Issues and What to Look For

### 1. Email Not Arriving at Worker

**Check Cloudflare Email Routing:**

- Go to Cloudflare Dashboard → `usecapgo.com` → Email → Email Routing
- Verify routing rule exists: `support@usecapgo.com` → Worker: `capgo_email-prod`

**What to look for in logs:**

- If you see NO logs at all when sending an email, the worker is not being triggered
- This means either:
  - Cloudflare Email Routing is not enabled
  - Email routing rule is incorrect
  - Email is being sent to wrong address

### 2. Worker Triggered But No Discord Thread

**Look for these log entries:**

```
🧠 classifyEmail: Starting AI classification...
```

- Check if Anthropic API key is present
- Check API response status (should be 200)

```
📊 Email classification result: {
  category: "other",
  shouldProcess: false,
  reason: "Spam detected"
}
```

- If `shouldProcess: false`, email was filtered out (spam, auto-reply, etc.)
- To disable filtering: `wrangler secret put USE_AI_CLASSIFICATION --env prod` → Enter: `false`

```
🟣 createForumThread: Starting...
```

- Check if Discord Bot Token is present
- Check Forum Channel ID is set

```
📡 Discord API response status: 403 Forbidden
```

- Bot doesn't have permissions in the forum channel
- Verify bot is invited to server
- Verify bot can access the private forum channel

```
📡 Discord API response status: 404 Not Found
```

- Forum Channel ID is incorrect
- Copy the correct channel ID from Discord (enable Developer Mode)

### 3. Anthropic API Errors

```
❌ Claude API error: 401 {"error":{"type":"authentication_error",...}}
```

- API key is invalid or not set
- Set correct API key: `wrangler secret put ANTHROPIC_API_KEY --env prod`

```
❌ Claude API error: 429 {"error":{"type":"rate_limit_error",...}}
```

- Rate limit exceeded
- Either wait or disable AI: `wrangler secret put USE_AI_CLASSIFICATION --env prod` → `false`

### 4. Discord API Errors

```
❌ Failed to create Discord thread
   Status: 401
   Response: {"message": "401: Unauthorized", "code": 0}
```

- Bot token is invalid
- Set correct token: `wrangler secret put DISCORD_BOT_TOKEN --env prod`

```
❌ Failed to create Discord thread
   Status: 403
   Response: {"message": "Missing Permissions", "code": 50013}
```

- Bot doesn't have required permissions
- Re-invite bot with correct permissions (see CAPGO_SETUP.md)
- Ensure bot can view and post in the private forum channel

```
❌ Failed to create Discord thread
   Status: 404
   Response: {"message": "Unknown Channel", "code": 10003}
```

- Forum Channel ID is wrong
- Get correct ID: Right-click channel → Copy ID
- Update: `wrangler secret put DISCORD_FORUM_CHANNEL_ID --env prod`

## Testing Checklist

### Test 1: Send Test Email

```bash
# Send from your email to support@capgo.app
# ForwardEmail.net should forward to support@usecapgo.com
# Worker should be triggered
```

**Expected logs:**

1. `📧 EMAIL WORKER: Email received`
2. `📨 Raw email metadata:` showing your email
3. `🔍 Parsing email...`
4. `✅ Email parsed:`
5. `🆕 Processing as NEW email`
6. `🤖 AI Classification: ENABLED`
7. `📡 Anthropic API response status: 200`
8. `✅ Email WILL BE PROCESSED`
9. `🟣 createForumThread: Starting...`
10. `📡 Discord API response status: 201`
11. `✅ Discord thread created successfully!`
12. `✅ EMAIL WORKER: Processing complete`

### Test 2: Check Discord

- Go to your private forum channel in Discord
- You should see a new thread with `[SUPPORT]`, `[SALES]`, or `[QUERY]` prefix
- Thread should contain your email content

## Quick Fixes

### Email Being Filtered as Spam

```bash
# Disable AI classification temporarily
wrangler secret put USE_AI_CLASSIFICATION --env prod
# Enter: false

# Check logs again - all emails should now be processed
```

### Bot Can't Access Forum Channel

1. Go to Discord → Server Settings → Roles
2. Find your bot's role
3. Go to forum channel → Edit Channel → Permissions
4. Add the bot's role with:
   - ✅ View Channel
   - ✅ Send Messages
   - ✅ Create Private Threads
   - ✅ Send Messages in Threads
   - ✅ Read Message History

### Missing Environment Variables

```bash
# List all secrets (won't show values, just names)
wrangler secret list --env prod

# Set any missing secrets
wrangler secret put DISCORD_BOT_TOKEN --env prod
wrangler secret put DISCORD_GUILD_ID --env prod
wrangler secret put DISCORD_FORUM_CHANNEL_ID --env prod
wrangler secret put ANTHROPIC_API_KEY --env prod
wrangler secret put RESEND_API_KEY --env prod
wrangler secret put EMAIL_FROM_ADDRESS --env prod
wrangler secret put EMAIL_FROM_NAME --env prod
```

## Advanced Debugging

### Check Worker Deployment

```bash
# List recent deployments
wrangler deployments list --env prod

# View specific deployment
wrangler deployments view <deployment-id> --env prod
```

### Check KV Namespace

```bash
# List all keys in KV
wrangler kv:key list --namespace-id 83eebe9478db4d91851a3a0aa137ec72

# Get specific mapping
wrangler kv:key get "email:thread:<message-id>" --namespace-id 83eebe9478db4d91851a3a0aa137ec72
```

### Test Health Endpoint

```bash
# Should return "OK"
curl https://email.capgo.app/health
```

## Support

If you're still having issues:

1. Copy the full logs from `wrangler tail`
2. Check which step is failing
3. Refer to the specific error section above
4. Check [CAPGO_SETUP.md](./CAPGO_SETUP.md) for setup verification
