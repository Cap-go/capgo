# CLI Navigation Events Integration

This document describes how the Capgo CLI should integrate with the console's real-time navigation feature.

## Overview

When the CLI performs certain operations, it should send navigation events to the backend API. The console listens to these events via Supabase real-time channels and automatically navigates the user to the appropriate page.

## API Endpoint

```
POST /private/navigation_events
```

### Authentication

The endpoint requires authentication using one of:
- API key header: `capgkey: <api-key>`
- JWT token header: `Authorization: Bearer <jwt-token>`

### Request Body

```typescript
{
  type: 'app:created' | 'bundle:uploaded' | 'logs:error',
  data: {
    appId: string,           // Required: The app ID
    bundleId?: string,       // Optional: Bundle version ID (required for bundle:uploaded)
    bundleName?: string      // Optional: Human-readable bundle name
  }
}
```

## Event Types

### 1. App Created (`app:created`)

Send this event after successfully creating a new app.

**When to send:**
- After `capgo app add` completes successfully
- After any command that creates a new app

**Example request:**
```bash
curl -X POST "https://api.capgo.app/private/navigation_events" \
  -H "capgkey: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "app:created",
    "data": {
      "appId": "com.example.myapp"
    }
  }'
```

**Console behavior:**
- Navigates to `/app/{appId}` to show the app dashboard

### 2. Bundle Uploaded (`bundle:uploaded`)

Send this event after successfully uploading a bundle.

**When to send:**
- After `capgo bundle upload` completes successfully
- After any command that uploads a new bundle version

**Example request:**
```bash
curl -X POST "https://api.capgo.app/private/navigation_events" \
  -H "capgkey: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "bundle:uploaded",
    "data": {
      "appId": "com.example.myapp",
      "bundleId": "1.0.0",
      "bundleName": "Production Release v1.0.0"
    }
  }'
```

**Console behavior:**
- Navigates to `/app/{appId}/bundle/{bundleId}` to show bundle details
- Falls back to `/app/{appId}/bundles` if bundleId is not provided

### 3. Logs with Error (`logs:error`)

Send this event when error logs are generated or reported.

**When to send:**
- After detecting errors in logs during CLI operations
- When error logs are uploaded or reported

**Example request:**
```bash
curl -X POST "https://api.capgo.app/private/navigation_events" \
  -H "capgkey: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "logs:error",
    "data": {
      "appId": "com.example.myapp"
    }
  }'
```

**Console behavior:**
- Navigates to `/app/{appId}/logs` to show app logs

## Implementation Guidelines

### Timing

- Send the event **after** the operation completes successfully
- Don't send events for failed operations
- Don't send events if the user is running in CI/CD or non-interactive mode (optional)

### Error Handling

- If the navigation event fails to send, **don't** fail the entire CLI operation
- Log the error but continue with normal CLI behavior
- The navigation event is a "nice to have" feature, not critical

### Example TypeScript Implementation

```typescript
async function sendNavigationEvent(
  type: 'app:created' | 'bundle:uploaded' | 'logs:error',
  data: {
    appId: string
    bundleId?: string
    bundleName?: string
  }
) {
  try {
    const response = await fetch(
      `${config.apiUrl}/private/navigation_events`,
      {
        method: 'POST',
        headers: {
          'capgkey': config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, data }),
      }
    )

    if (!response.ok) {
      console.warn('Failed to send navigation event:', response.status)
    }
  } catch (error) {
    // Silently fail - don't interrupt the user's workflow
    console.debug('Navigation event failed:', error)
  }
}

// Usage examples:
async function appAdd(appId: string) {
  // ... create app logic ...
  
  // Send navigation event
  await sendNavigationEvent('app:created', { appId })
}

async function bundleUpload(appId: string, version: string) {
  // ... upload bundle logic ...
  
  // Send navigation event
  await sendNavigationEvent('bundle:uploaded', {
    appId,
    bundleId: version,
    bundleName: `Version ${version}`,
  })
}
```

## Testing

You can test the endpoint manually:

```bash
# Test app:created event
curl -X POST "http://localhost:54321/functions/v1/private/navigation_events" \
  -H "capgkey: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "app:created",
    "data": {
      "appId": "com.demo.app"
    }
  }'
```

Expected response:
```json
{
  "status": "ok"
}
```

## Console Integration

The console automatically:
1. Subscribes to navigation events when a user logs in
2. Listens on channel `navigation:{orgId}` 
3. Receives broadcast messages and navigates accordingly
4. Unsubscribes when the user logs out

No changes needed on the console side - it's already listening!

## Security

- Events are only broadcasted to the organization that owns the app
- The backend verifies that the authenticated user/API key has permission to send events for the specified app
- Malicious events cannot navigate users to apps they don't own

## Questions?

For questions or issues, please open an issue in the `Cap-go/capgo` repository.
