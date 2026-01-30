# Architecture Diagram: Realtime Navigation Events

## System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Capgo CLI (User's Machine)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User runs command                                                       │
│     $ capgo app add com.example.app                                         │
│                                                                             │
│  2. CLI creates app (existing logic)                                        │
│     ✅ App created successfully                                             │
│                                                                             │
│  3. CLI sends navigation event                                              │
│     POST /private/navigation_events                                         │
│     {                                                                       │
│       "type": "app:created",                                                │
│       "data": {"appId": "com.example.app"}                                  │
│     }                                                                       │
│                                                                             │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               │ HTTPS (API Key Auth)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Backend API (Cloudflare Workers)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  /private/navigation_events endpoint                                        │
│                                                                             │
│  4. Validate authentication (API key/JWT)                                   │
│     ✅ User authenticated                                                   │
│                                                                             │
│  5. Verify app ownership                                                    │
│     Query: SELECT owner_org FROM apps WHERE app_id = ?                      │
│     Check: apikey.owner_org == app.owner_org                                │
│     ✅ User owns app                                                        │
│                                                                             │
│  6. Broadcast to Supabase Realtime                                          │
│     Channel: navigation:{orgId}                                             │
│     Event: navigation                                                       │
│     Payload: {type, data}                                                   │
│     ✅ Event broadcasted                                                    │
│                                                                             │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               │ WebSocket (Supabase Realtime)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Supabase Realtime Channel Service                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Channel: navigation:{orgId}                                                │
│                                                                             │
│  7. Receive broadcast message                                               │
│  8. Forward to all subscribers on this channel                              │
│     (Only users in this organization)                                       │
│                                                                             │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               │ WebSocket
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Console Web App (User's Browser)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  realtimeEvents Store (Pinia)                                               │
│                                                                             │
│  9. Receive broadcast event                                                 │
│     Event: navigation                                                       │
│     Payload: {type: "app:created", data: {...}}                             │
│                                                                             │
│  10. Handle navigation based on type                                        │
│      switch (payload.type) {                                                │
│        case "app:created":                                                  │
│          router.push(`/app/${appId}`)                                       │
│          break                                                              │
│        case "bundle:uploaded":                                              │
│          router.push(`/app/${appId}/bundle/${bundleId}`)                    │
│          break                                                              │
│        case "logs:error":                                                   │
│          router.push(`/app/${appId}/logs`)                                  │
│          break                                                              │
│      }                                                                      │
│                                                                             │
│  11. Page automatically navigates                                           │
│      🚀 User sees app page without manual navigation!                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Subscription Lifecycle

### On User Login (Console)

```
User logs in
    │
    ├─> auth.ts: guard() detects new session
    │
    ├─> Initialize realtimeEvents store
    │
    ├─> subscribe() called
    │       │
    │       ├─> Create channel: navigation:{orgId}
    │       │
    │       ├─> Set up broadcast listener
    │       │
    │       └─> Subscribe to channel
    │               │
    │               └─> Status: SUBSCRIBED
    │                       │
    │                       └─> isSubscribed = true
    │
    └─> Ready to receive events!
```

### On Event Received (Console)

```
Supabase Realtime broadcasts message
    │
    ├─> Console receives broadcast
    │
    ├─> handleNavigationEvent() called
    │
    ├─> Extract event type and data
    │
    ├─> Router navigation
    │       │
    │       └─> try {
    │               await router.push(path)
    │           } catch (error) {
    │               console.error(error)
    │           }
    │
    └─> User sees new page!
```

### On User Logout (Console)

```
User logs out
    │
    ├─> main.ts: logout() called
    │
    ├─> Auth sign out
    │
    ├─> Import realtimeEvents store (dynamic)
    │
    ├─> unsubscribe() called
    │       │
    │       ├─> Remove channel from Supabase
    │       │
    │       ├─> channel = null
    │       │
    │       └─> isSubscribed = false
    │
    └─> Cleanup complete
```

## Security Flow

```
┌─────────────┐
│ CLI Request │
└──────┬──────┘
       │
       ├─> Has API Key or JWT?
       │   ├─ No  → 401 Unauthorized
       │   └─ Yes → Continue
       │
       ├─> App exists?
       │   ├─ No  → 404 Not Found
       │   └─ Yes → Continue
       │
       ├─> User owns app?
       │   ├─ No  → 403 Forbidden
       │   └─ Yes → Continue
       │
       └─> Broadcast to channel: navigation:{orgId}
               │
               └─> Only users in orgId can receive
```

## Channel Isolation

```
Organization A                Organization B
    │                             │
    ├─ User 1 (subscribed)        ├─ User 3 (subscribed)
    └─ User 2 (subscribed)        └─ User 4 (subscribed)
         │                             │
         │                             │
    Channel:                      Channel:
    navigation:org-a-uuid         navigation:org-b-uuid
         │                             │
         │                             │
    Event from CLI                Event from CLI
    (org A user)                  (org B user)
         │                             │
         ↓                             ↓
    User 1 receives               User 3 receives
    User 2 receives               User 4 receives
         
    ❌ User 3 cannot receive       ❌ User 1 cannot receive
    ❌ User 4 cannot receive       ❌ User 2 cannot receive
```

## Performance Characteristics

```
CLI sends event
    │
    ├─ HTTP POST time: ~50-100ms
    │
    ├─ Backend processing: ~20-50ms
    │   ├─ Auth validation: ~10ms
    │   ├─ DB query: ~5-10ms
    │   └─ Channel broadcast: ~5-10ms
    │
    ├─ Realtime propagation: ~20-50ms
    │
    └─ Console receives & navigates: ~10-20ms
    
Total latency: ~100-220ms (typically < 200ms)
```

## Error Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                         Error Scenarios                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Backend Errors:                                                │
│  ├─ Invalid event type → 400 Bad Request                        │
│  ├─ Missing appId → 400 Bad Request                             │
│  ├─ No authentication → 401 Unauthorized                        │
│  ├─ App not found → 404 Not Found                               │
│  ├─ User doesn't own app → 403 Forbidden                        │
│  ├─ Channel subscription timeout → 500 Internal Error           │
│  └─ Broadcast failed → 500 Internal Error                       │
│                                                                 │
│  Frontend Errors:                                               │
│  ├─ Channel subscription failed                                 │
│  │  └─ Status: CHANNEL_ERROR / TIMED_OUT                        │
│  │      └─ isSubscribed = false                                 │
│  │          └─ User continues using console normally            │
│  │                                                              │
│  ├─ Navigation failed                                           │
│  │  └─ try-catch logs error                                     │
│  │      └─ User stays on current page                           │
│  │                                                              │
│  └─ Unsubscribe failed                                          │
│     └─ Error logged, logout continues                           │
│                                                                 │
│  CLI Handling:                                                  │
│  └─ Navigation event fails                                      │
│     └─ Silently logged (debug)                                  │
│         └─ CLI operation continues successfully                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Monitoring Points

```
Backend Metrics:
├─ Navigation events received (count)
├─ Authentication failures (count)
├─ Authorization failures (count)
├─ Broadcast successes (count)
├─ Broadcast failures (count)
└─ Average latency (ms)

Frontend Metrics:
├─ Channel subscription attempts (count)
├─ Subscription successes (count)
├─ Subscription failures (count)
├─ Events received (count)
├─ Navigation successes (count)
└─ Navigation failures (count)
```
