# Capgo Email-to-Discord Setup

This guide is specific to the Capgo production setup with:
- **Primary Domain**: `capgo.app` (ForwardEmail.net for SMTP)
- **Secondary Domain**: `usecapgo.com` (Cloudflare Email Routing)

## Architecture

```
Customer emails: support@capgo.app
         ↓
ForwardEmail.net MX records (capgo.app)
         ↓
Forward to: support@usecapgo.com
         ↓
Cloudflare Email Routing (usecapgo.com)
         ↓
Worker: capgo_email-prod
         ↓
Discord Forum Thread

Reply from Discord
         ↓
Resend API
         ↓
FROM: support@capgo.app (primary domain)
         ↓
Customer receives reply
```

## Step 1: ForwardEmail.net Configuration

1. Go to ForwardEmail.net dashboard for `capgo.app`
2. Add email forwarding rule:
   ```
   support@capgo.app → support@usecapgo.com
   ```
3. Save the forwarding rule

**Important**: ForwardEmail.net preserves all email headers needed for threading (From, Message-ID, In-Reply-To, References)

## Step 2: Cloudflare Email Routing (usecapgo.com)

1. Go to Cloudflare Dashboard → `usecapgo.com` domain
2. Navigate to **Email** → **Email Routing**
3. Click **Enable Email Routing**
4. Add routing rule:
   - **Email**: `support@usecapgo.com`
   - **Action**: Worker
   - **Worker**: `capgo_email-prod`
5. Save the routing rule

## Step 3: Resend Configuration (capgo.app)

1. Log in to [resend.com](https://resend.com)
2. Go to **Domains** → Add Domain
3. Add domain: `capgo.app`
4. Add the following DNS records to `capgo.app` (in Cloudflare DNS):

   ```
   Type: TXT
   Name: @
   Value: [Resend verification token]

   Type: CNAME
   Name: resend._domainkey
   Value: [Resend DKIM value]

   Type: MX (if not already used by ForwardEmail)
   Name: @
   Priority: 10
   Value: [Resend MX if needed]
   ```

   **Note**: You already have MX records for ForwardEmail.net, so skip the MX record for Resend.

5. Wait for domain verification (green checkmark)
6. Create API key:
   - Go to **API Keys**
   - Click **Create API Key**
   - Name: "Capgo Email Worker"
   - Copy the key (starts with `re_`)

## Step 4: Discord Setup

### Bot Creation

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create application: "Capgo Email Bot"
3. Go to **Bot** tab → Create bot
4. Copy **Bot Token** → Save as `DISCORD_BOT_TOKEN`
5. Enable **Privileged Gateway Intents**:
   - ✅ Message Content Intent

### Bot Permissions

1. Go to **OAuth2 → URL Generator**
2. Under "Scopes", check: `bot`
3. After selecting `bot`, the "Bot Permissions" section appears below
4. Select permissions:
   - ✅ Read Messages/View Channels
   - ✅ Send Messages
   - ✅ Create Private Threads
   - ✅ Send Messages in Threads
   - ✅ Read Message History
5. Copy the generated URL and open in browser
6. Select your Capgo Discord server
7. Authorize the bot

### Private Forum Channel

1. In Discord, create a **PRIVATE forum channel**:
   - Right-click server → Create Channel → Forum
   - Name: "Email Support" (or similar)
2. **Set Permissions** (IMPORTANT for privacy):
   - Disable "View Channel" for @everyone
   - Enable "View Channel" only for support team role
3. Right-click channel → Copy ID → Save as `DISCORD_FORUM_CHANNEL_ID`
4. Right-click server → Copy ID → Save as `DISCORD_GUILD_ID`

## Step 5: Deploy Worker

### Set Cloudflare Secrets

```bash
cd cloudflare_workers/email

# Set all secrets for production
wrangler secret put DISCORD_BOT_TOKEN --env prod
# Paste your Discord bot token

wrangler secret put DISCORD_GUILD_ID --env prod
# Paste your Discord server ID

wrangler secret put DISCORD_FORUM_CHANNEL_ID --env prod
# Paste your Discord forum channel ID

wrangler secret put ANTHROPIC_API_KEY --env prod
# Paste your Anthropic API key (sk-ant-...)

wrangler secret put RESEND_API_KEY --env prod
# Paste your Resend API key (re_...)

wrangler secret put EMAIL_FROM_ADDRESS --env prod
# Enter: support@capgo.app

wrangler secret put EMAIL_FROM_NAME --env prod
# Enter: Capgo Support Team
```

### Deploy to Production

```bash
wrangler deploy --env prod
```

You should see:
```
✨ Successfully deployed capgo_email-prod
   URL: https://email.capgo.app
```

## Step 6: Test the Setup

### Test 1: Email Reception

Send a test email to `support@capgo.app`:

```
Subject: Test email integration
Body: This is a test to see if the Capgo email worker is working!
```

**Expected Result:**
1. ForwardEmail.net forwards to `support@usecapgo.com`
2. Cloudflare Email Routing triggers `capgo_email-prod` worker
3. Claude AI classifies the email (likely as [QUERY] or [SUPPORT])
4. New thread appears in Discord forum with classification prefix
5. Original sender shows in Discord (not ForwardEmail.net)

### Test 2: Email Threading

Reply to your test email from your email client.

**Expected Result:**
- Worker detects `In-Reply-To` header
- Reply is posted to existing Discord thread (no new thread created)

### Test 3: Discord Reply (requires webhook setup)

Reply in the Discord thread.

**Expected Result:**
- Email sent from `support@capgo.app` (your primary domain)
- Proper threading headers maintained
- Appears as reply in email client

## Environment Variables Summary

| Variable | Value | Purpose |
|----------|-------|---------|
| `DISCORD_BOT_TOKEN` | `MTIzNDU2...` | Discord bot authentication |
| `DISCORD_GUILD_ID` | `123456789...` | Your Discord server ID |
| `DISCORD_FORUM_CHANNEL_ID` | `987654321...` | Private forum channel ID |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Claude AI classification |
| `RESEND_API_KEY` | `re_123abc...` | Resend email sending |
| `EMAIL_FROM_ADDRESS` | `support@capgo.app` | Primary domain (reply FROM address) |
| `EMAIL_FROM_NAME` | `Capgo Support Team` | Display name |

## Monitoring

### Check Worker Logs

```bash
wrangler tail --env prod
```

### Check Deployments

```bash
wrangler deployments list --env prod
```

### Check Email Routing (Cloudflare Dashboard)

1. Go to `usecapgo.com` → Email → Email Routing
2. View email routing metrics
3. Check for any errors or failed deliveries

## Troubleshooting

### Emails Not Arriving at Discord

**Check ForwardEmail.net:**
1. Log in to ForwardEmail.net
2. Check forwarding logs
3. Verify `support@capgo.app` → `support@usecapgo.com` rule is active

**Check Cloudflare Email Routing:**
1. Go to Cloudflare Dashboard → `usecapgo.com` → Email
2. Verify routing rule: `support@usecapgo.com` → Worker: `capgo_email-prod`
3. Check Email Routing logs

**Check Worker Logs:**
```bash
wrangler tail --env prod
```

Look for:
- "Received email from: ..."
- "Email classification: ..."
- "Creating new Discord thread..."

### Discord Thread Not Created

**Verify Bot Permissions:**
1. In Discord, go to Server Settings → Integrations
2. Find "Capgo Email Bot"
3. Verify it has access to the forum channel

**Check Classification:**
- Email might be classified as "other" (spam/auto-reply)
- Check logs: `wrangler tail --env prod`
- If needed, disable AI: `wrangler secret put USE_AI_CLASSIFICATION --env prod` → Enter: `false`

### Replies Not Sending

**Verify Resend Domain:**
1. Go to Resend dashboard → Domains
2. Ensure `capgo.app` is verified (green checkmark)
3. Check API key is valid

**Check Worker Logs:**
```bash
wrangler tail --env prod
```

Look for Resend errors.

## Security Checklist

- ✅ Forum channel is PRIVATE (only support team can view)
- ✅ Discord bot has minimal permissions (no admin access)
- ✅ Resend domain verified with SPF/DKIM
- ✅ Secrets stored in Cloudflare (not in code)
- ✅ ForwardEmail.net preserves original sender headers
- ✅ KV namespace not publicly accessible

## Next Steps

- [ ] Set up Discord webhook for two-way communication (see [README.md](./README.md))
- [ ] Add more email addresses (sales@capgo.app, info@capgo.app)
- [ ] Monitor classification accuracy
- [ ] Set up alerts for failed emails
- [ ] Add email signature removal (optional enhancement)

## Support

For issues:
1. Check worker logs: `wrangler tail --env prod`
2. Review [README.md](./README.md) for detailed documentation
3. Check [MULTI_DOMAIN_SETUP.md](./MULTI_DOMAIN_SETUP.md) for architecture details
