# @capgo/capacitor-notifications

First-party Capgo native notification plugin for Capacitor apps.

It handles:

- APNs and FCM token registration with Capgo
- Foreground notification receive events
- Notification open tracking
- Badge count reads and writes
- Background data notification callbacks
- Silent Capgo live update checks through `@capgo/capacitor-updater`

## Setup

```bash
npm install @capgo/capacitor-notifications @capgo/capacitor-updater
npx cap sync
```

Or let the Capgo CLI patch the app entrypoint:

```bash
npx @capgo/cli@latest notifications setup
```

## Usage

```ts
import { CapgoNotifications } from '@capgo/capacitor-notifications'

await CapgoNotifications.configure({
  appId: 'com.example.app',
  autoUpdater: true,
  updateInstallMode: 'next',
})

await CapgoNotifications.register({
  externalId: 'customer-user-123',
  tags: ['paid'],
  attributes: { plan: 'team' },
  consent: true,
})

CapgoNotifications.addListener('notificationReceived', (notification) => {
  console.log('Received', notification)
})

CapgoNotifications.addListener('notificationOpened', (event) => {
  console.log('Opened', event)
})
```

## Silent Update Checks

When Capgo sends a silent notification with `capgoAction=update_check`, this plugin asks `@capgo/capacitor-updater` for the latest bundle, downloads it, and either:

- queues it with `next`, so it installs on the next app restart/background cycle
- installs it with `set`, when configured by the Capgo app setting

iOS background pushes remain best-effort and can be throttled by the OS.
