# Default Channel Validation Rules

## Overview

Default channels (public channels) in Capgo have specific validation rules to ensure proper platform distribution and prevent conflicts.

## Rules

### 1. Maximum 3 Public Channels Per App

An application can have a maximum of **3 public (default) channels**. This allows for:
- One default channel serving all platforms (iOS, Android, Electron)
- OR up to three platform-specific default channels (one per platform)
- OR any combination in between (e.g., one for iOS+Android, another for Electron)

### 2. One Public Channel Per Platform

Each platform (iOS, Android, Electron) can only be enabled in **one public channel** at a time. This prevents ambiguity when devices query for their default channel.

## Valid Configurations

### Single Default Channel (All Platforms)
```json
{
  "name": "production",
  "public": true,
  "ios": true,
  "android": true,
  "electron": true
}
```

### Three Platform-Specific Channels
```json
[
  {
    "name": "ios-production",
    "public": true,
    "ios": true,
    "android": false,
    "electron": false
  },
  {
    "name": "android-production",
    "public": true,
    "ios": false,
    "android": true,
    "electron": false
  },
  {
    "name": "electron-production",
    "public": true,
    "ios": false,
    "android": false,
    "electron": true
  }
]
```

### Mixed Configuration
```json
[
  {
    "name": "mobile-production",
    "public": true,
    "ios": true,
    "android": true,
    "electron": false
  },
  {
    "name": "desktop-production",
    "public": true,
    "ios": false,
    "android": false,
    "electron": true
  }
]
```

## Invalid Configurations

### ❌ More Than 3 Public Channels
```json
// This will fail - 4 public channels
[
  {"name": "channel1", "public": true, "ios": true, ...},
  {"name": "channel2", "public": true, "android": true, ...},
  {"name": "channel3", "public": true, "electron": true, ...},
  {"name": "channel4", "public": true, ...} // ❌ Exceeds limit
]
```

### ❌ Duplicate Platform in Public Channels
```json
// This will fail - iOS enabled in two public channels
[
  {
    "name": "ios-prod",
    "public": true,
    "ios": true,  // ✓
    "android": false,
    "electron": false
  },
  {
    "name": "ios-beta",
    "public": true,
    "ios": true,  // ❌ Conflict
    "android": false,
    "electron": false
  }
]
```

## Error Messages

### Max Public Channels Error
```json
{
  "error": "max_public_channels",
  "message": "Maximum 3 public channels allowed per app. You can have one default channel for all platforms or up to three (one per platform: iOS, Android, Electron)."
}
```

### Platform Duplicate Errors
```json
{
  "error": "duplicate_platform_ios",
  "message": "Another public channel \"ios-prod\" already supports iOS platform. Only one public channel per platform is allowed."
}
```

```json
{
  "error": "duplicate_platform_android",
  "message": "Another public channel \"android-prod\" already supports Android platform. Only one public channel per platform is allowed."
}
```

```json
{
  "error": "duplicate_platform_electron",
  "message": "Another public channel \"electron-prod\" already supports Electron platform. Only one public channel per platform is allowed."
}
```

## Implementation Details

### Backend Validation

Validation is implemented in `supabase/functions/_backend/utils/supabase.ts` in the `updateOrCreateChannel` function. It runs before any channel creation or update operation.

### When Validation Runs

- Creating a new public channel
- Updating an existing channel to be public
- Updating an existing public channel's platform settings

### Private Channels

**Important:** These validation rules only apply to public channels (`public: true`). Private channels can be created without these restrictions.

## Testing

Comprehensive test coverage is provided in `tests/channel_default_validation.test.ts`, including:

- ✓ Valid configurations (single all-platform, three platform-specific)
- ✓ Invalid configurations (exceeding limits, platform conflicts)
- ✓ Update scenarios (changing existing channels)
- ✓ Private channel independence (not affected by rules)

## API Usage

### Creating a Public Channel

```bash
POST /channel
{
  "app_id": "com.example.app",
  "channel": "production",
  "public": true,
  "ios": true,
  "android": true,
  "electron": true
}
```

### Setting Platform-Specific Channels

```bash
# iOS-only public channel
POST /channel
{
  "app_id": "com.example.app",
  "channel": "ios-production",
  "public": true,
  "ios": true,
  "android": false,
  "electron": false
}
```

## Migration Notes

For existing applications with multiple public channels that may violate these rules:
1. The validation is enforced on channel creation/update only
2. Existing channels are grandfathered until modified
3. Update channels to comply with the rules before making changes
