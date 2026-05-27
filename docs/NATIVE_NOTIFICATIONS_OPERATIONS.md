# Native notifications operations

Native notifications use Cloudflare Analytics Engine for active device state and
events. Capgo Postgres stores only provider config, app settings, and campaign
metadata.

## Cloudflare queues

The API worker must have the notification queues created before deploy:

```bash
bun run deploy:cloudflare:notifications:queues
```

To create only one environment:

```bash
bun scripts/ensure-native-notification-queues.ts alpha
bun scripts/ensure-native-notification-queues.ts preprod
bun scripts/ensure-native-notification-queues.ts prod
```

The script creates the primary queue and dead-letter queue names referenced by
`cloudflare_workers/api/wrangler.jsonc`.

## Provider secrets

The dashboard stores only provider metadata and the expected secret reference.
The private FCM/APNs credential must be present in the API worker environment
under the exact name shown in the app Notifications tab before a provider is
marked configured.

Configured FCM providers require `projectId` in provider config. Configured APNs
providers require `teamId`, `keyId`, and `bundleId`.
