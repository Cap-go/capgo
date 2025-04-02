# Performance Analysis for Default Channel Migration

## Overview
This analysis addresses performance concerns in PR #1107 "Move default channel to app table" which implements moving default channel configurations from individual channel records to the application level.

## Identified Performance Concerns

### 1. Migration Script Performance
The migration script in `20250330054527_move_default_channel_to_app_table.sql` has several performance issues:

- **Row-by-Row Processing**: The script loops through all apps individually and performs multiple database operations for each app (2 SELECTs and 1 UPDATE per app).
- **Scalability Issues**: For large databases with many apps, this approach could be inefficient and slow.
- **No Batch Processing**: The script doesn't use batch processing or more efficient SQL operations.

### 2. Channel API Performance
The changes to the channel API endpoints introduce additional complexity:

- **Computed Public Property**: The `channel/get.ts` endpoint now computes the 'public' property based on whether a channel is set as default in the apps table.
- **Complex Queries**: The SQL query in `pg.ts` now uses a subquery to check if a channel is default, which could be inefficient.
- **Multiple Database Operations**: When creating or updating channels that are marked as public, multiple database operations are performed sequentially.

### 3. UI Operations
The UI changes introduce potential performance bottlenecks:

- **Multiple Database Operations**: The UI performs multiple database operations when changing default channels, especially when toggling sync mode.
- **No Batching**: There's no batching of operations, which could lead to performance issues with many concurrent users.
- **Sequential Operations**: When changing default channels, operations are performed sequentially rather than in parallel.

## Recommendations

### 1. Optimize Migration Script
```sql
-- Replace the loop-based migration with a more efficient set-based approach
DO $$
BEGIN
    -- Update Android default channels in a single operation
    UPDATE public.apps a
    SET default_channel_android = c.id
    FROM public.channels c
    WHERE c.app_id = a.app_id
      AND c.public = true
      AND c.android = true
      AND c.id = (
        SELECT id FROM public.channels
        WHERE app_id = a.app_id
          AND public = true
          AND android = true
        ORDER BY updated_at DESC
        LIMIT 1
      );
    
    -- Update iOS default channels in a single operation
    UPDATE public.apps a
    SET default_channel_ios = c.id
    FROM public.channels c
    WHERE c.app_id = a.app_id
      AND c.public = true
      AND c.ios = true
      AND c.id = (
        SELECT id FROM public.channels
        WHERE app_id = a.app_id
          AND public = true
          AND ios = true
        ORDER BY updated_at DESC
        LIMIT 1
      );
    
    -- Set default_channel_sync in a single operation
    UPDATE public.apps
    SET default_channel_sync = (
        (default_channel_android IS NOT NULL AND default_channel_ios IS NOT NULL AND default_channel_android = default_channel_ios)
        OR (default_channel_android IS NULL AND default_channel_ios IS NULL)
    );
END $$;
```

### 2. Optimize Channel API
```typescript
// Optimize the channel/get.ts endpoint to use a more efficient query
// Use a JOIN instead of a subquery to determine if a channel is default
export async function get(c: Context, params: ChannelGet, apikey: Database['public']['Tables']['apikeys']['Row']) {
  // ...existing code...
  
  // Optimize the query to join with apps table instead of using a subquery
  const { data, error } = await supabaseAdmin(c)
    .from('channels')
    .select(`
      *,
      app_id:apps!inner(
        default_channel_android,
        default_channel_ios
      )
    `)
    .eq('app_id', params.app_id)
    .order('updated_at', { ascending: false });
  
  // Process the results to add the public property
  if (data) {
    return c.json(data.map(o => {
      const newObject = { ...o };
      newObject.public = (o.app_id.default_channel_android === o.id || o.app_id.default_channel_ios === o.id);
      return newObject;
    }));
  }
  // ...error handling...
}
```

### 3. Optimize UI Operations
```typescript
// Batch operations when changing default channels
async function setDefaultUpdateChannel(type: 'android' | 'ios' | 'both') {
  // ...existing code...
  
  // Use a single update operation for both channels when type is 'both'
  if (type === 'both') {
    const { error } = await supabase.from('apps')
      .update({
        default_channel_ios: channelId,
        default_channel_android: channelId
      })
      .eq('app_id', appRef.value?.app_id ?? '');
    
    if (error) {
      toast.error(t('cannot-change-update-channel'));
      console.error(error);
      return;
    }
    
    // Update local state in a single operation
    if (appRef.value) {
      const channelInfo = {
        id: channelId,
        name: channelName
      } as any;
      
      appRef.value.default_channel_android = channelInfo;
      appRef.value.default_channel_ios = channelInfo;
      forceBump.value += 1;
    }
  }
  // ...existing code for single channel updates...
}
```

### 4. Add Indexes for Performance
```sql
-- Add indexes to improve query performance
CREATE INDEX IF NOT EXISTS idx_channels_app_id_android_ios ON public.channels(app_id, android, ios);
CREATE INDEX IF NOT EXISTS idx_apps_default_channels ON public.apps(default_channel_android, default_channel_ios);
```

## Conclusion
Implementing these recommendations will significantly improve the performance of the default channel migration and subsequent operations. The set-based approach for migration, optimized queries for the API, and batched operations for the UI will ensure better scalability and responsiveness, especially for large databases with many apps and users.
