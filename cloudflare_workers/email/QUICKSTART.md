# Email-to-Discord Worker - Quick Start Guide

Get your email-to-Discord integration running in 15 minutes!

## Prerequisites Checklist

- [ ] Cloudflare account with a domain
- [ ] Discord server with admin access
- [ ] Resend account (required for email sending)
- [ ] Anthropic API key (for Claude AI classification)

## 5-Minute Setup

### 1. Discord Bot (3 minutes)

1. Go to https://discord.com/developers/applications
2. Click "New Application" → Name it "Email Bot"
3. Go to "Bot" → Click "Add Bot"
4. Copy the bot token → Save as `DISCORD_BOT_TOKEN`
5. Enable "Message Content Intent" under Privileged Gateway Intents
6. Go to **OAuth2 → URL Generator**
   - Under "Scopes", check: `bot`
   - After selecting `bot`, the "Bot Permissions" section appears below
   - Under "Bot Permissions", select:
     - ✅ Read Messages/View Channels
     - ✅ Send Messages
     - ✅ Create Private Threads (for private forum channels)
     - ✅ Send Messages in Threads
     - ✅ Read Message History
7. Copy the generated URL at the bottom and open it in your browser to invite
   the bot to your server
8. **Create a PRIVATE forum channel in Discord** (for your support team only)
   - Right-click your server → Create Channel → Forum
   - Set permissions so only your team can view it
   - **Important**: Make it private to keep customer emails confidential!
9. Right-click channel → Copy ID → Save as `DISCORD_FORUM_CHANNEL_ID`
10. Right-click server → Copy ID → Save as `DISCORD_GUILD_ID`

### 2. Resend Setup (2 minutes)

1. Sign up at https://resend.com
2. Go to API Keys → Create new key
3. Copy key → Save as `RESEND_API_KEY`
4. Go to Domains → Add your domain
5. Add DNS records as shown
6. Wait for verification ✅

### 3. Anthropic API (1 minute)

1. Go to https://console.anthropic.com
2. Get your API key
3. Copy key → Save as `ANTHROPIC_API_KEY`

### 4. Deploy Worker (5 minutes)

```bash
# Navigate to the email worker directory
cd cloudflare_workers/email

# Create KV namespace
wrangler kv namespace create "EMAIL_THREAD_MAPPING"
# Copy the ID and update wrangler.jsonc

# Set secrets
wrangler secret bulk .env --env prod
or
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_GUILD_ID
wrangler secret put DISCORD_FORUM_CHANNEL_ID
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put EMAIL_FROM_ADDRESS
# Enter: support@yourdomain.com
wrangler secret put EMAIL_FROM_NAME
# Enter: Support Team

# Deploy!
wrangler deploy --env prod
```

### 5. Cloudflare Email Routing (2 minutes)

1. Go to Cloudflare Dashboard → Your domain → Email → Email Routing
2. Click "Enable Email Routing"
3. Add routing rule:
   - Email: `support@yourdomain.com`
   - Action: Worker
   - Select: `capgo_email-prod`
4. Save!

## Test It!

Send a test email to `support@yourdomain.com`:

```
Subject: Test email integration
Body: This is a test to see if the email worker is working!
```

You should see:

1. A new thread in Discord with `[QUERY]` prefix
2. Your email content formatted nicely
3. Worker logs showing classification results

Reply from Discord and check if you receive an email back!

## Troubleshooting

**Discord thread not created?**

- Check worker logs: `wrangler tail --env prod`
- Verify bot has permissions in the forum channel
- Check Discord bot token is correct

**Email not arriving?**

- Check Cloudflare Email Routing is enabled
- Verify routing rule points to the worker
- Check worker deployment: `wrangler deployments list`

**Emails being ignored?**

- Check classification logs - might be categorized as "other"
- Try setting `USE_AI_CLASSIFICATION=false` for heuristic mode
- Verify ANTHROPIC_API_KEY is set correctly

**Discord replies not sending emails?**

- This requires webhook setup (see full README)
- Check Resend API key is valid
- Verify domain is verified in Resend

## Next Steps

- Set up Discord webhook for two-way communication (see README)
- Add multiple email addresses
- Configure different forum channels for different email categories
- Monitor usage and adjust classification settings

## Configuration Summary

Here's what you configured:

| Variable                   | Purpose                           | Example                  |
| -------------------------- | --------------------------------- | ------------------------ |
| `DISCORD_BOT_TOKEN`        | Discord bot authentication        | `MTIzNDU2Nzg5...`        |
| `DISCORD_GUILD_ID`         | Your Discord server ID            | `123456789012345678`     |
| `DISCORD_FORUM_CHANNEL_ID` | Forum channel for threads         | `987654321098765432`     |
| `ANTHROPIC_API_KEY`        | Claude AI for classification      | `sk-ant-api03-...`       |
| `RESEND_API_KEY`           | Resend API key for sending emails | `re_123abc...`           |
| `EMAIL_FROM_ADDRESS`       | Reply-to email address            | `support@yourdomain.com` |
| `EMAIL_FROM_NAME`          | Sender display name               | `Support Team`           |

## Support

- Full documentation: [README.md](./README.md)
- Issues: Check worker logs with `wrangler tail`
- Questions: See troubleshooting section in README

Happy emailing! 📧→💬
