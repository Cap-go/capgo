# Capgo Preview Deployment System

This document describes the automated preview deployment system for Capgo, which creates isolated preview environments for every pull request using Cloudflare Pages and Workers with **production configuration**.

## Overview

The preview system automatically:
- 🚀 Deploys a complete preview environment for every pull request
- 🔄 Updates the preview when new commits are pushed
- 🧹 Cleans up resources when the PR is closed
- 💬 Comments on PRs with preview URLs
- 🔗 Provides isolated environments for testing changes
- ⚡ Uses production configuration for realistic testing

## Architecture

Each preview environment consists of:

### Frontend (Cloudflare Pages)
- **Project Name**: `capgo-preview-{PR_NUMBER}`
- **URL**: `https://capgo-preview-{PR_NUMBER}.pages.dev`
- **Branch**: `preview-{PR_NUMBER}`
- **Build**: Production build (`bun mobile`)

### Backend Workers
- **API Worker**: `capgo-api-preview-{PR_NUMBER}.workers.dev`
- **Files Worker**: `capgo-files-preview-{PR_NUMBER}.workers.dev`  
- **Plugin Worker**: `capgo-plugin-preview-{PR_NUMBER}.workers.dev`
- **Config**: Production configuration with preview names

## Configuration

### Production Configuration
Preview environments use the same configuration as production:
- Same database connections (production Supabase)
- Same API endpoints and secrets
- Same environment variables
- Same build process

The only differences are:
- Preview-specific naming for Cloudflare resources
- Workers deployed to `*.workers.dev` instead of custom domains

### Required Secrets
The GitHub workflow requires these repository secrets:
- `CLOUDFLARE_API_TOKEN` - Token with Pages and Workers permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `VITE_VAPID_KEY` - Vapid key for PWA functionality
- `VITE_FIREBASE_CONFIG` - Firebase configuration

## Workflow

### Automatic Deployment
The preview system triggers on:
- Pull request opened
- New commits pushed to PR
- Pull request reopened

### Build Process
1. **Frontend**: Uses `bun mobile` (production build)
2. **Workers**: Uses existing production `wrangler.json` configs
3. **Deployment**: Modifies worker names and removes custom domains

### Automatic Cleanup  
Resources are cleaned up when:
- Pull request is closed
- Pull request is merged

## Manual Operations

Since the system uses production configuration, manual operations are simple:

### Build for Preview
```bash
# Same as production build
bun mobile
```

### Deploy to Preview URLs
```bash
# Set PR number
export PR_NUMBER=123

# Deploy frontend
bunx wrangler pages deploy dist --project-name capgo-preview-$PR_NUMBER

# Deploy workers (modify configs and deploy)
# This is handled automatically by the workflow
```

## Implementation Details

### Worker Configuration
The workflow automatically:
1. Takes existing production `wrangler.json` files
2. Modifies the `name` field to include PR number
3. Sets `workers_dev: true` to deploy to `*.workers.dev`
4. Removes custom domain routing
5. Keeps all other production settings (databases, analytics, etc.)

### Example Configuration Transformation
```json
// Production config
{
  "name": "capgo_api-prod",
  "workers_dev": false,
  "route": { "pattern": "api.capgo.app" },
  // ... other production settings
}

// Preview config (auto-generated)
{
  "name": "capgo-api-preview-123",
  "workers_dev": true,
  // ... same production settings without routing
}
```

## Benefits

### Realistic Testing
- Uses actual production configuration
- Tests with real database connections
- Same build process as production
- Identical environment variables

### Simplified Maintenance
- No duplicate configuration files
- No custom preview scripts
- Automatically stays in sync with production
- Reduced configuration drift

### Cost Effective
- Uses Cloudflare's free tier for previews
- No additional database instances needed
- Automatic cleanup prevents resource waste

## Security Considerations

**Important**: Preview environments use production configuration, which means:
- ✅ Realistic testing environment
- ⚠️ Previews connect to production databases
- ⚠️ Preview changes can affect production data
- 🔒 Consider read-only access for sensitive operations

### Best Practices
- Test carefully on previews as they use production backends
- Consider implementing preview-specific safeguards in your application
- Monitor production databases for preview-related activity
- Use feature flags to disable sensitive operations in preview mode

## Troubleshooting

### Common Issues

**Preview deployment fails**
- Check Cloudflare API token permissions
- Verify account ID is correct
- Check for worker compilation errors

**Workers not accessible**
- Verify `*.workers.dev` domains are accessible
- Check worker logs in Cloudflare dashboard
- Ensure production config is valid

### Manual Cleanup
If automated cleanup fails, manually delete from Cloudflare dashboard:
1. Pages project: `capgo-preview-{PR_NUMBER}`
2. Workers:
   - `capgo-api-preview-{PR_NUMBER}`
   - `capgo-files-preview-{PR_NUMBER}`
   - `capgo-plugin-preview-{PR_NUMBER}`

## Monitoring

Monitor preview deployments through:
- GitHub Actions workflow logs
- Cloudflare Dashboard → Workers & Pages
- PR comments with deployment status
- Production database logs (preview activity)

## Limitations

- Previews share production database (by design)
- No environment isolation for backend services
- Changes in previews may affect production data
- Custom domains not available for preview workers