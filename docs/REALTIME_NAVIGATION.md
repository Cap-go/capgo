# Real-time Console Navigation Feature

## Overview

This feature enables the Capgo CLI to send navigation events that automatically open relevant pages in the console web application.

## How It Works

```
┌─────────┐                    ┌─────────────┐                  ┌─────────┐
│   CLI   │──── HTTP POST ────▶│   Backend   │──── Realtime ───▶│ Console │
└─────────┘                    └─────────────┘                  └─────────┘
                                     │
                               Supabase Channel
                              navigation:{orgId}
```

1. **CLI sends event**: After completing an operation (app creation, bundle upload), the CLI sends a navigation event to `/private/navigation_events`
2. **Backend broadcasts**: The backend validates the request and broadcasts the event via Supabase realtime to the user's organization channel
3. **Console receives & navigates**: The console (if open) receives the event and automatically navigates to the relevant page

## Supported Events

| Event Type        | When to Send                    | Console Navigation               |
|-------------------|---------------------------------|----------------------------------|
| `app:created`     | After creating a new app        | Opens `/app/{appId}`             |
| `bundle:uploaded` | After uploading a bundle        | Opens `/app/{appId}/bundle/{bundleId}` |
| `logs:error`      | When error logs are detected    | Opens `/app/{appId}/logs`        |

## User Experience

**Before:**
```bash
$ capgo app add com.example.app
✅ App created successfully!
👉 Visit https://capgo.app/app to see your app
```
User has to manually:
1. Switch to browser
2. Navigate to capgo.app
3. Find their app in the list
4. Click to open it

**After:**
```bash
$ capgo app add com.example.app
✅ App created successfully!
🚀 Opening in console...
```
If console is open in browser:
1. Page automatically navigates to the new app
2. User immediately sees their app dashboard
3. Zero manual navigation needed!

## Implementation Files

### Backend
- **`supabase/functions/_backend/private/navigation_events.ts`**: New endpoint that receives events and broadcasts them
- **`cloudflare_workers/api/index.ts`**: Routes the `/private/navigation_events` endpoint

### Frontend
- **`src/stores/realtimeEvents.ts`**: Pinia store managing the realtime subscription and event handling
- **`src/modules/auth.ts`**: Initializes the realtime subscription on user login

### Tests
- **`tests/navigation-events.test.ts`**: Backend API tests for the navigation events endpoint

### Documentation
- **`docs/CLI_NAVIGATION_EVENTS.md`**: Complete API documentation for CLI integration

## CLI Integration

See [`docs/CLI_NAVIGATION_EVENTS.md`](./CLI_NAVIGATION_EVENTS.md) for complete integration guide.

Quick example:
```typescript
// After successful bundle upload
await fetch(`${apiUrl}/private/navigation_events`, {
  method: 'POST',
  headers: {
    'capgkey': apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'bundle:uploaded',
    data: {
      appId: 'com.example.app',
      bundleId: '1.0.0',
    },
  }),
})
```

## Security

- Events are authenticated using API keys or JWT tokens
- Backend verifies the user owns the app before broadcasting
- Events are only sent to the organization's private channel
- Channel name format: `navigation:{orgId}`

## Technical Details

### Supabase Realtime Channels

The implementation uses Supabase's **broadcast** feature (not database subscriptions):
- No database tables needed
- Events are ephemeral (not stored)
- Low latency (< 100ms)
- Automatic reconnection on network issues

### Channel Subscription

Console subscribes on login:
```typescript
const channel = supabase
  .channel(`navigation:${orgId}`)
  .on('broadcast', { event: 'navigation' }, (payload) => {
    handleNavigation(payload)
  })
  .subscribe()
```

Console unsubscribes on logout to free resources.

## Future Enhancements

Possible future event types:
- `build:completed` - Navigate to build details
- `deployment:success` - Navigate to deployment logs
- `channel:updated` - Navigate to channel settings
- `device:registered` - Navigate to device details

## Testing

Run backend tests:
```bash
bun test:backend navigation-events
```

Manual testing:
1. Start Supabase: `bunx supabase start`
2. Open console in browser
3. Send test event via curl (see CLI_NAVIGATION_EVENTS.md)
4. Observe browser navigating automatically

## Rollout

1. ✅ Backend endpoint implemented
2. ✅ Frontend listener implemented  
3. ✅ Tests added
4. ⏳ CLI integration pending (separate PR in @capgo/cli repo)
5. ⏳ User announcement after CLI integration complete
