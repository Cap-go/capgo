# Capgo Preview Deployment System

This document describes the automated preview deployment system for Capgo, which creates isolated preview environments for every pull request using Cloudflare Pages and Workers.

## Overview

The preview system automatically:
- 🚀 Deploys a complete preview environment for every pull request
- 🔄 Updates the preview when new commits are pushed
- 🧹 Cleans up resources when the PR is closed
- 💬 Comments on PRs with preview URLs
- 🔗 Provides isolated environments for testing changes

## Architecture

Each preview environment consists of:

### Frontend (Cloudflare Pages)
- **Project Name**: `capgo-preview-{PR_NUMBER}`
- **URL**: `https://capgo-preview-{PR_NUMBER}.pages.dev`
- **Branch**: `preview-{PR_NUMBER}`

### Backend Workers
- **API Worker**: `capgo-api-preview-{PR_NUMBER}.workers.dev`
- **Files Worker**: `capgo-files-preview-{PR_NUMBER}.workers.dev`  
- **Plugin Worker**: `capgo-plugin-preview-{PR_NUMBER}.workers.dev`

## Configuration

### Environment Variables
The preview environment uses the `preview` configuration from `configs.json`:

```json
{
  "base_domain": {
    "preview": "capgo-preview.pages.dev"
  },
  "supa_url": {
    "preview": "https://aucsybvnhavogdmzwtcw.supabase.co"
  },
  "api_domain": {
    "preview": "api-preview.workers.dev"
  }
}
```

### Required Secrets
The GitHub workflow requires these repository secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_VAPID_KEY`
- `VITE_FIREBASE_CONFIG`

## Workflow

### Automatic Deployment
The preview system triggers on:
- Pull request opened
- New commits pushed to PR
- Pull request reopened

### Automatic Cleanup  
Resources are cleaned up when:
- Pull request is closed
- Pull request is merged

## Manual Operations

### Deploy Preview Locally
```bash
# Set PR number
export PR_NUMBER=123

# Deploy complete preview environment
npm run deploy:preview:all

# Or deploy components individually
npm run deploy:preview:frontend
npm run deploy:preview:workers
```

### Cleanup Preview Environment
```bash
# Set PR number
export PR_NUMBER=123

# Clean up all preview resources
npm run cleanup:preview
```

### Generate Worker Configurations
```bash
# Generate wrangler config for specific worker type
WORKER_TYPE=api PR_NUMBER=123 node scripts/generate_preview_config.mjs
WORKER_TYPE=files PR_NUMBER=123 node scripts/generate_preview_config.mjs
WORKER_TYPE=plugin PR_NUMBER=123 node scripts/generate_preview_config.mjs
```

## Scripts

### `scripts/generate_preview_config.mjs`
Generates dynamic wrangler configurations for preview workers with PR-specific naming.

### `scripts/cleanup_preview.mjs`
Removes all Cloudflare resources associated with a preview environment.

## Troubleshooting

### Common Issues

**Preview deployment fails**
- Check if Cloudflare API token has sufficient permissions
- Verify account ID is correct
- Ensure no resource naming conflicts

**Worker deployment fails**
- Check if worker files exist in expected locations
- Verify wrangler configuration is valid
- Check for syntax errors in worker code

**Cleanup fails**
- Resources may have already been deleted
- Check Cloudflare API token permissions
- Manual cleanup may be required in Cloudflare dashboard

### Manual Cleanup
If automated cleanup fails, manually delete:
1. Cloudflare Pages project: `capgo-preview-{PR_NUMBER}`
2. Workers:
   - `capgo-api-preview-{PR_NUMBER}`
   - `capgo-files-preview-{PR_NUMBER}`
   - `capgo-plugin-preview-{PR_NUMBER}`

## Cost Considerations

- Each preview environment uses Cloudflare's free tier resources
- Preview environments are automatically cleaned up to minimize costs
- Consider implementing additional cleanup strategies for long-running PRs

## Security

- Preview environments use development/staging credentials
- No production data or secrets are exposed
- Preview workers have limited permissions
- Environments are isolated per PR

## Monitoring

Monitor preview deployments through:
- GitHub Actions workflow logs
- Cloudflare Dashboard
- PR comments with deployment status
- Worker analytics in Cloudflare

## Future Enhancements

Potential improvements:
- Custom domain routing for previews
- Database preview environments
- Preview environment health checks
- Automated testing on preview environments
- Preview environment metrics and analytics