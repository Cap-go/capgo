# Discord → Email: How It Works

## Overview

When you reply to an email thread in Discord, the worker automatically sends your message back to the original email sender. This creates a seamless bidirectional communication channel.

## How It Works

### 1. Automatic Polling (Every 2 Minutes)

The worker runs on a schedule (cron trigger) every 2 minutes:

```jsonc
{
  "triggers": {
    "crons": ["*/2 * * * *"]  // Every 2 minutes
  }
}
```

### 2. What Happens During Each Poll

1. **Fetch all active thread mappings** from KV storage
   - Each mapping contains: Discord thread ID, original email sender, subject, etc.

2. **For each thread:**
   - Fetch recent messages from Discord API
   - Check for new messages since last poll
   - Filter out bot messages (only process human messages)

3. **Send new messages as emails:**
   - Format Discord message as email
   - Send via Resend with proper threading headers (In-Reply-To, References)
   - Track message ID to avoid duplicates

4. **Update tracking:**
   - Store the last processed message ID in KV
   - Refresh thread mapping TTL to keep active threads alive

## Why Polling Instead of Webhooks?

**Discord doesn't provide webhooks for forum thread messages.**

Discord webhooks are for **sending TO Discord**, not receiving FROM Discord. The only way to receive messages from Discord is:

1. **Discord Gateway (WebSocket)** - Requires persistent connection, not suitable for Cloudflare Workers
2. **Polling via REST API** - Perfect for scheduled workers ✅

## Message Deduplication

The worker tracks the last processed message ID for each thread:

```
KV Storage:
last-message:987654321 → "1234567890"  // Last Discord message ID
```

When polling, it only processes messages with IDs greater than the stored ID.

## Example Flow

1. **Customer sends email:** `help@capgo.app`
2. **Worker creates Discord thread** with message ID stored in KV
3. **You reply in Discord:** "Hi! I can help with that..."
4. **2 minutes later, cron runs:**
   - Fetches your Discord message
   - Sends email to customer with proper threading
   - Stores your message ID to avoid duplicates
5. **Customer receives email** and sees your reply in their inbox

## Monitoring

Check cron execution logs:

```bash
# Watch for scheduled worker runs
wrangler tail --env prod

# Look for these log entries:
⏰ SCHEDULED WORKER: Polling Discord for new messages
📋 Found 3 active thread mappings
🔍 Checking thread 987654321 for new messages
   Found 1 new message(s) to send as email
📤 Processing message 1234567890 from username
✅ Sent email reply to customer@example.com
```

## Customization

### Change Polling Frequency

Edit `wrangler.jsonc`:

```jsonc
{
  "triggers": {
    "crons": ["*/5 * * * *"]  // Every 5 minutes (slower, less API calls)
    // OR
    "crons": ["* * * * *"]    // Every minute (faster, more API calls)
  }
}
```

**Note:** Discord API has rate limits. Don't poll more than once per minute.

### Message Limit Per Thread

The worker fetches the 10 most recent messages per thread. You can adjust this in the code:

```typescript
const messages = await getThreadMessages(env, mapping.discordThreadId, 10)
//                                                                      ^^
//                                                                      Change this number
```

## TTL and Cleanup

- **Thread mappings:** 30 days TTL, refreshed on each new message
- **Last message IDs:** 30 days TTL
- Inactive threads automatically expire after 30 days of no activity

## Troubleshooting

### Discord replies not sending?

1. **Check cron is running:**
   ```bash
   wrangler tail --env prod
   # Should see "⏰ SCHEDULED WORKER" every 2 minutes
   ```

2. **Check Resend API key:**
   ```bash
   wrangler secret list --env prod
   # Should show RESEND_API_KEY
   ```

3. **Check thread mappings:**
   ```bash
   wrangler kv:key list --namespace-id 83eebe9478db4d91851a3a0aa137ec72
   # Should see keys like: thread:email:987654321
   ```

4. **Check Discord bot permissions:**
   - Bot needs "Read Message History" permission
   - Bot needs access to the private forum channel

### Messages being sent multiple times?

- This means message ID tracking isn't working
- Check KV storage for `last-message:*` keys
- Verify KV writes are succeeding (check logs)

### Replies delayed by more than 2 minutes?

- Check cron trigger is configured correctly in `wrangler.jsonc`
- Verify worker is deployed: `wrangler deployments list --env prod`
- Check for errors in logs: `wrangler tail --env prod --search ERROR`

## Cost Considerations

**Cloudflare Workers:**
- First 100,000 requests/day: Free
- Cron triggers count as requests: ~720/day (every 2 minutes)
- Well within free tier ✅

**Discord API:**
- Rate limit: 50 requests per second per token
- We make ~1-2 requests per cron run
- Well within limits ✅

**Resend:**
- 3,000 emails/month free
- $0.001 per email after that
- For support emails, likely within free tier ✅

## Summary

✅ **No manual setup needed** - just deploy and it works
✅ **Automatic deduplication** - messages sent only once
✅ **Proper email threading** - conversations stay organized
✅ **Low cost** - stays within free tiers for most usage
✅ **Reliable** - polling is more reliable than webhooks for this use case

The 2-minute delay is a reasonable tradeoff for simplicity and reliability. Most support conversations don't require instant responses anyway!
