# Multi-Domain Email Setup Guide

This guide explains how to use the Email Worker with ForwardEmail.net (or similar services) when you can't set up Cloudflare Email Routing on your primary domain.

## Problem

You already have MX records configured on your primary domain (e.g., for Google Workspace, Microsoft 365, or ForwardEmail.net), so you can't enable Cloudflare Email Routing directly.

## Solution: Secondary Domain Forwarding

Use a secondary domain for Cloudflare Email Routing and forward emails from your primary domain.

## Architecture

```
Primary Domain: yourdomain.com (existing MX records)
  ↓
ForwardEmail.net (or other email forwarding service)
  ↓
Secondary Domain: email-worker.yourdomain.com (Cloudflare Email Routing)
  ↓
Cloudflare Email Worker → Discord
```

## Setup Steps

### 1. Add a Secondary Domain to Cloudflare

You have two options:

**Option A: Subdomain (Recommended)**

- Add a subdomain to your existing domain: `email-worker.yourdomain.com`
- Cloudflare supports Email Routing on subdomains

**Option B: Separate Domain**

- Use a completely separate domain: `yourdomain-email.com`
- Must be added to your Cloudflare account

### 2. Enable Cloudflare Email Routing on Secondary Domain

```bash
# In Cloudflare Dashboard
1. Go to your secondary domain (email-worker.yourdomain.com)
2. Email → Email Routing → Enable
3. Add routing rule:
   - Email: support@email-worker.yourdomain.com
   - Action: Worker
   - Worker: capgo_email
```

### 3. Configure ForwardEmail.net (or Your Email Provider)

In ForwardEmail.net dashboard for `yourdomain.com`:

```
Alias: support@yourdomain.com
Forward to: support@email-worker.yourdomain.com
```

**Other Email Providers:**

- **Google Workspace**: Use Email Forwarding in Gmail settings
- **Microsoft 365**: Use Mail Flow Rules (Transport Rules)
- **cPanel/DirectAdmin**: Use Email Forwarders
- **Postfix/Sendmail**: Add to `/etc/aliases` or virtual alias map

### 4. Configure Resend for Replies

**Important**: When replying from Discord, you want emails to come **from** your primary domain (`support@yourdomain.com`), not the secondary domain.

In Resend dashboard:

1. Add and verify your **primary domain** (`yourdomain.com`)
2. Add DNS records as instructed
3. Use `support@yourdomain.com` as `EMAIL_FROM_ADDRESS`

**Environment Variable:**

```bash
EMAIL_FROM_ADDRESS=support@yourdomain.com  # Your primary domain
EMAIL_FROM_NAME="Support Team"
```

## How It Works

### Incoming Emails

1. Customer sends email to: `support@yourdomain.com`
2. MX records route to ForwardEmail.net
3. ForwardEmail.net forwards to: `support@email-worker.yourdomain.com`
4. Cloudflare Email Routing triggers the worker
5. Worker creates Discord thread

**Important**: The worker preserves the original `From` header, so it knows the real sender!

### Outgoing Replies (Discord → Email)

1. Team member replies in Discord thread
2. Worker reads original sender from stored mapping
3. Worker sends email via Resend **from** `support@yourdomain.com`
4. Email threading headers maintain conversation context
5. Customer receives reply from your primary domain

## Email Threading Preservation

ForwardEmail.net (and most forwarding services) preserve critical headers:

- ✅ `From` - Original sender
- ✅ `Message-ID` - Unique message identifier
- ✅ `In-Reply-To` - Thread parent reference
- ✅ `References` - Full thread chain
- ✅ `Subject` - Email subject

This means **threading works perfectly** even with forwarding!

## Testing Your Setup

### Test 1: Incoming Email

```bash
# Send test email to your primary domain
echo "Test email from ForwardEmail setup" | mail -s "Test Email" support@yourdomain.com
```

**Expected Result:**

- Email arrives at ForwardEmail.net
- Forwards to `support@email-worker.yourdomain.com`
- Worker creates Discord thread with [QUERY] or [SUPPORT] prefix
- Original sender appears in Discord (not ForwardEmail.net)

### Test 2: Email Reply Threading

```bash
# Reply to the test email from your email client
# The reply should have In-Reply-To header
```

**Expected Result:**

- Worker detects it's a reply
- Posts to existing Discord thread (doesn't create new one)

### Test 3: Discord Reply

1. Reply in the Discord thread
2. Check your email inbox

**Expected Result:**

- Email comes from `support@yourdomain.com` (your primary domain)
- Has proper threading headers
- Appears as a reply in your email client

## Troubleshooting

### Emails Not Arriving at Worker

1. **Check ForwardEmail.net logs**: Verify forwarding is working
2. **Check Cloudflare Email Routing**: Verify routing rule is correct
3. **Check worker logs**: `wrangler tail --env prod`

```bash
# You should see:
# "Received email from: customer@example.com, to: support@email-worker.yourdomain.com"
```

### Original Sender Not Preserved

Some email providers modify the `From` header. Check if yours supports these headers:

- `X-Original-From`
- `X-Forwarded-For`
- `Reply-To`

If needed, modify the parser to check alternative headers:

```typescript
// In email-parser.ts
const fromHeader = headers.get('x-original-from')
  || headers.get('from')
  || message.from
```

### Replies Going to Wrong Address

**Problem**: Replies are being sent to `support@email-worker.yourdomain.com` instead of `support@yourdomain.com`

**Solution**: Ensure `EMAIL_FROM_ADDRESS` in your worker environment is set to your **primary domain**:

```bash
wrangler secret put EMAIL_FROM_ADDRESS
# Enter: support@yourdomain.com (NOT the secondary domain)
```

### Resend Domain Not Verified

You must verify your **primary domain** in Resend:

1. Go to Resend dashboard → Domains
2. Add `yourdomain.com`
3. Add the DNS records they provide
4. Wait for verification ✅

## Multiple Email Addresses

You can forward multiple addresses to the same worker:

**ForwardEmail.net Configuration:**

```
support@yourdomain.com   → support@email-worker.yourdomain.com
sales@yourdomain.com     → sales@email-worker.yourdomain.com
info@yourdomain.com      → info@email-worker.yourdomain.com
```

**Cloudflare Email Routing:**

```
support@email-worker.yourdomain.com → Worker: capgo_email
sales@email-worker.yourdomain.com   → Worker: capgo_email
info@email-worker.yourdomain.com    → Worker: capgo_email
```

**Optional Enhancement**: Detect which address was used and reply from that address:

```typescript
// Add to index.ts in the email handler
async email(message: EmailMessage, env: Env): Promise<void> {
  // Detect which address was used
  if (message.to.includes('sales@')) {
    env.EMAIL_FROM_ADDRESS = 'sales@yourdomain.com'
  } else if (message.to.includes('support@')) {
    env.EMAIL_FROM_ADDRESS = 'support@yourdomain.com'
  }

  // Continue with normal processing...
}
```

## Cost Considerations

- **ForwardEmail.net**: Free for basic forwarding, or $3/month for enhanced features
- **Cloudflare Email Routing**: Free
- **Resend**: 3,000 emails/month free, then $0.10 per 1,000 emails
- **Anthropic Claude API**: ~$0.25 per 1M input tokens (very cheap for classification)

## Alternative Email Forwarding Services

If you don't use ForwardEmail.net, these also work:

1. **ImprovMX** - Free email forwarding
2. **SimpleLogin** - Privacy-focused forwarding
3. **AnonAddy** - Anonymous email forwarding
4. **Mailgun** - Programmatic email routing
5. **SendGrid Inbound Parse** - Webhook-based routing
6. **Cloudflare Email Workers** - If you can set up a subdomain

All of these preserve the necessary headers for threading!

## Security Considerations

### SPF Records

Your secondary domain needs SPF records for Resend:

```
# DNS TXT record for email-worker.yourdomain.com
v=spf1 include:_spf.resend.com ~all
```

### DKIM Signing

Resend will DKIM-sign emails from your primary domain once verified.

### DMARC Policy

Your primary domain should have a DMARC policy:

```
# DNS TXT record for _dmarc.yourdomain.com
v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

Start with `p=none` to monitor, then move to `p=quarantine` or `p=reject` once everything works.

## Summary

✅ **This setup works perfectly** with the existing code
✅ **No code changes required** - just configuration
✅ **Email threading preserved** - replies go to correct threads
✅ **Original sender preserved** - Discord shows real sender
✅ **Replies from primary domain** - maintains brand consistency

The worker is designed to handle this exact scenario!
