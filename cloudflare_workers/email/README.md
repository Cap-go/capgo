# Email-to-Discord Worker

This Cloudflare Worker handles bidirectional communication between email and Discord forum channels.

## Features

- **AI-Powered Email Classification**: Uses Claude AI to automatically classify emails as support, sales, query, or other
- **Smart Filtering**: Only processes support, sales, and query emails - safely ignores spam, auto-replies, and unrelated messages
- **Incoming Emails → Discord**: Automatically creates categorized forum threads for relevant emails (with [SUPPORT], [SALES], or [QUERY] prefixes)
- **Discord Replies → Email**: Sends Discord messages back to the original email sender
- **Thread Management**: Maintains conversation context using email threading headers
- **Persistent Storage**: Uses Cloudflare KV to map email threads to Discord threads
- **Fallback Mode**: Includes heuristic-based classification if AI is unavailable

## Architecture

```
Email → Cloudflare Email Worker → Discord Forum Thread
Discord Message → Webhook → Cloudflare Worker → Email Reply
```

## Setup

### 1. Prerequisites

- Cloudflare account with Email Routing enabled
- Discord server with a forum channel
- Discord bot with appropriate permissions

### 2. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** section and create a bot
4. Copy the **Bot Token** (you'll need this for `DISCORD_BOT_TOKEN`)
5. Enable the following **Privileged Gateway Intents**:
   - Message Content Intent
6. Go to **OAuth2 → URL Generator**
7. Under "Scopes", check: `bot` and optionally `applications.commands` (if you want slash commands later)
8. After selecting `bot`, the "Bot Permissions" section appears below
9. Under "Bot Permissions", select:
   - ✅ Read Messages/View Channels
   - ✅ Send Messages
   - ✅ Create Private Threads (for private forum channels)
   - ✅ Send Messages in Threads
   - ✅ Read Message History
10. Copy the generated URL at the bottom and open it in your browser to invite the bot to your server

### 3. Discord Channel Configuration

1. **Create a PRIVATE Forum Channel** in your Discord server
   - Right-click your server → Create Channel → Forum
   - **Set channel permissions**:
     - Disable "View Channel" for @everyone
     - Enable "View Channel" only for your support team role
   - **Important**: Keep it private to protect customer email confidentiality
2. Right-click on the forum channel → **Copy Channel ID** (enable Developer Mode in Discord settings if needed)
3. Right-click on your server → **Copy Server ID**

### 4. Environment Variables

Create a `.env` file or set the following secrets in Cloudflare:

```bash
# Discord Configuration
DISCORD_BOT_TOKEN="your-bot-token-here"
DISCORD_GUILD_ID="your-server-id"
DISCORD_FORUM_CHANNEL_ID="your-forum-channel-id"

# Email Configuration (Resend)
EMAIL_FROM_ADDRESS="support@yourdomain.com"
EMAIL_FROM_NAME="Your Support Team"
RESEND_API_KEY="re_your_api_key_here"

# AI Classification
ANTHROPIC_API_KEY="sk-ant-your-api-key-here"
USE_AI_CLASSIFICATION="true"  # Set to "false" to use heuristic classification
```

#### Why Resend?

- **Better deliverability** - High sender reputation and optimized infrastructure
- **Full email threading** - Proper In-Reply-To and References header support
- **Multiple domains** - Verify and send from multiple FROM addresses
- **Easy setup** - Simple domain verification via DNS
- **Great DX** - Clean API and excellent documentation
- **Generous free tier** - 3,000 emails/month free, then pay-as-you-go

> **Note**: MailChannels discontinued their free service for Cloudflare Workers as of August 31, 2024. Resend is now the recommended solution.

### 5. Cloudflare Configuration

#### Create KV Namespace

```bash
# Create production KV namespace
wrangler kv:namespace create "EMAIL_THREAD_MAPPING"

# Create preview namespace for development
wrangler kv:namespace create "EMAIL_THREAD_MAPPING" --preview
```

Copy the namespace IDs and update [wrangler.jsonc](./wrangler.jsonc):

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "EMAIL_THREAD_MAPPING",
      "id": "your-production-kv-id",
      "preview_id": "your-preview-kv-id"
    }
  ]
}
```

#### Set Secrets

```bash
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_GUILD_ID
wrangler secret put DISCORD_FORUM_CHANNEL_ID
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put EMAIL_FROM_ADDRESS
wrangler secret put EMAIL_FROM_NAME
```

### 6. Resend Setup

Setup Resend for email sending:

1. Sign up at [resend.com](https://resend.com)
2. Go to **API Keys** and create a new API key
3. Copy the API key (starts with `re_`)
4. Add it as a Cloudflare secret: `wrangler secret put RESEND_API_KEY`

#### Multiple Email Addresses

Resend supports multiple sending addresses - perfect for handling different email addresses:

1. Go to **Domains** in Resend dashboard
2. Add and verify each domain you want to send from:
   - `support@yourdomain.com`
   - `sales@yourdomain.com`
   - `info@yourdomain.com`
3. Follow DNS verification steps for each domain
4. Update `EMAIL_FROM_ADDRESS` based on which address should handle replies

**Routing Multiple Addresses:**

You can route different email addresses to the same worker but use different FROM addresses for replies:

```javascript
// In the worker, detect which address was used
if (message.to === 'sales@yourdomain.com') {
  env.EMAIL_FROM_ADDRESS = 'sales@yourdomain.com'
}
else if (message.to === 'support@yourdomain.com') {
  env.EMAIL_FROM_ADDRESS = 'support@yourdomain.com'
}
```

### 7. Email Routing Setup

#### Option A: Direct Email Routing (If you don't have existing MX records)

1. Go to **Cloudflare Dashboard** → **Email** → **Email Routing**
2. Enable Email Routing for your domain
3. Add a destination address (e.g., `support@yourdomain.com`)
4. Create a **Custom Address** with a **Worker** action
5. Select this worker (`capgo_email`)

Example routing rule:

```
support@yourdomain.com → Worker: capgo_email
```

#### Option B: Multi-Domain Setup (If you already have MX records)

If your primary domain already has MX records configured (e.g., for Google Workspace, ForwardEmail.net, or other email services), you can use a secondary domain or subdomain for Cloudflare Email Routing.

**Quick Setup:**

1. Set up Cloudflare Email Routing on a secondary domain/subdomain (e.g., `email-worker.yourdomain.com`)
2. Configure your existing email service to forward emails to the secondary domain
3. Configure Resend to send from your **primary domain**

**📖 See [MULTI_DOMAIN_SETUP.md](./MULTI_DOMAIN_SETUP.md) for detailed instructions**

This setup works perfectly with services like:

- ForwardEmail.net
- ImprovMX
- Google Workspace
- Microsoft 365
- Any email forwarding service

### 7. Discord → Email (Automatic Polling)

The worker automatically polls Discord every 2 minutes to check for new messages in threads and sends them as email replies.

**How it works:**

1. Every 2 minutes, the scheduled worker runs (configured via cron trigger)
2. It checks all active Discord threads for new messages
3. When it finds a message from a human (not the bot), it sends an email reply to the original sender
4. The message ID is tracked to avoid sending duplicates

**The cron trigger is already configured in wrangler.jsonc:**

```jsonc
{
  "triggers": {
    "crons": ["*/2 * * * *"] // Every 2 minutes
  }
}
```

**Note:** Discord doesn't provide webhooks for forum thread messages, so polling is the most reliable approach. The 2-minute interval balances responsiveness with API rate limits.

### 8. Deploy

```bash
# Deploy to production
wrangler deploy

# Deploy to specific environment
wrangler deploy --env preprod
```

## Usage

### Sending an Email

1. Send an email to your configured address (e.g., `support@yourdomain.com`)
2. The worker will:
   - Parse the email
   - Create a new Discord forum thread
   - Post the email content as the first message
   - Store the mapping in KV

### Replying to an Email

1. Reply to the email thread from your email client
2. The worker will:
   - Detect the thread using `In-Reply-To` header
   - Find the corresponding Discord thread
   - Post the reply as a new message in the thread

### Replying from Discord

1. Someone replies in the Discord forum thread
2. The webhook (or polling) detects the new message
3. The worker will:
   - Find the original email sender from KV
   - Format the Discord message as an email
   - Send an email reply with proper threading headers

## How It Works

### Email Threading

The worker uses standard email headers to maintain conversation threads:

- `Message-ID`: Unique identifier for each email
- `In-Reply-To`: References the message being replied to
- `References`: Chain of all previous messages in the thread

### Storage Structure

KV stores bidirectional mappings:

```
email:thread:<message-id> → { discordThreadId, originalSender, subject, ... }
thread:email:<discord-thread-id> → { emailMessageId, originalSender, subject, ... }
```

TTL: 30 days (auto-renewed on each message)

### AI Email Classification

The worker uses **Claude 3.5 Haiku** to intelligently classify incoming emails:

**Categories:**

- **support** - Bug reports, technical issues, help requests → [SUPPORT] prefix
- **sales** - Pricing inquiries, demos, purchasing questions → [SALES] prefix
- **query** - General questions, feature requests, feedback → [QUERY] prefix
- **other** - Spam, auto-replies, unrelated content → **Ignored (not posted to Discord)**

**How it works:**

1. New email arrives (not a reply)
2. Claude AI analyzes the subject and body
3. Email is classified with confidence score
4. Only support/sales/query emails are posted to Discord
5. Spam, auto-replies, and unrelated emails are silently ignored

**Fallback Mode:**
If AI classification is disabled (`USE_AI_CLASSIFICATION=false`) or unavailable, the worker uses keyword-based heuristic classification as a backup.

**Benefits:**

- Reduces noise in Discord by filtering spam and auto-replies
- Automatically categorizes emails for easy team routing
- Learns from context, not just keywords
- Fast and cost-effective (Claude Haiku)

### Email Sending

The worker uses **Resend** for sending emails:

- Better deliverability and sender reputation
- Full email threading support (In-Reply-To, References)
- Multiple verified domains support
- 3,000 emails/month free tier
- Pay-as-you-go pricing beyond free tier

## Testing

### Test Email Reception

```bash
# Send a test email to your configured address
echo "Test email body" | mail -s "Test Subject" support@yourdomain.com
```

### Test Discord Webhook

```bash
curl -X POST https://email.yourdomain.com/discord-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": 0,
    "channel_id": "your-thread-id",
    "author": {
      "username": "TestUser",
      "bot": false
    },
    "content": "Test Discord reply"
  }'
```

### Local Development

```bash
# Start the worker locally
wrangler dev

# Test with miniflare
npx wrangler dev --local
```

## Monitoring

### Logs

```bash
# Tail production logs
wrangler tail

# Tail specific environment
wrangler tail --env preprod
```

### Analytics

Check the Cloudflare Dashboard for:

- Email routing metrics
- Worker invocations
- Error rates
- KV operations

## Troubleshooting

### Emails Not Creating Threads

1. Check Email Routing configuration in Cloudflare Dashboard
2. Verify the worker is properly configured as the routing action
3. Check worker logs: `wrangler tail`
4. Verify Discord bot permissions

### Discord Replies Not Sending Emails

1. Verify webhook is properly configured
2. Check that the bot can read messages in the forum
3. Ensure the thread mapping exists in KV
4. Check MailChannels status

### Thread Mapping Not Found

- Mappings expire after 30 days
- Ensure KV namespace is properly bound
- Check that `Message-ID` headers are being parsed correctly

## Security Considerations

1. **Email Validation**: Consider adding sender verification to prevent spam
2. **Rate Limiting**: Implement rate limits to prevent abuse
3. **Content Filtering**: Add content moderation for both email and Discord
4. **Webhook Security**: Verify Discord webhook signatures (recommended)
5. **KV Access**: Ensure KV namespace is not publicly accessible

## Limitations

- **KV TTL**: Thread mappings expire after 30 days (configurable)
- **Email Size**: Large emails may be truncated to fit Discord's message limits
- **Attachments**: Email attachments are not currently supported (can be added)
- **Rich Formatting**: Complex HTML emails are converted to plain text
- **Rate Limits**: Subject to Discord and MailChannels rate limits

## Future Enhancements

- [ ] Support for email attachments → Discord file uploads
- [ ] Better HTML email rendering in Discord embeds
- [ ] Email signature detection and removal
- [ ] Multiple forum channel support
- [ ] Auto-categorization based on email subject
- [ ] Discord slash commands for email management
- [ ] Analytics dashboard
- [ ] Email templates for Discord replies

## API Reference

### Email Worker Handler

```typescript
async email(message: EmailMessage, env: Env): Promise<void>
```

Handles incoming emails from Cloudflare Email Routing.

### HTTP Endpoints

#### `GET /health`

Health check endpoint.

**Response**: `200 OK`

#### `POST /discord-webhook`

Webhook endpoint for Discord messages.

**Body**: Discord webhook payload

**Response**: `200 OK`

## License

Same as the parent project.

## Support

For issues or questions:

1. Check the [troubleshooting section](#troubleshooting)
2. Review worker logs with `wrangler tail`
3. Open an issue in the repository
