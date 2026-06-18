// src/build/prescan/upload-intent.ts
import type { ScanContext } from './types'

// Play upload requires the SA JSON to reach the builder. --no-playstore-upload
// deletes PLAY_CONFIG_JSON upstream (request.ts:1393-1396) BEFORE prescan runs
// (gate at request.ts:1597), so its mere presence in the merged set is the exact
// upload signal. Zero new ScanContext fields required.
export function willUploadToPlay(ctx: ScanContext): boolean {
  return ctx.platform === 'android' && Boolean(ctx.credentials?.PLAY_CONFIG_JSON)
}

// iOS upload requires app_store mode AND the complete ASC API key triplet.
// ad_hoc never uploads; a partial triplet never uploads. Default undefined->app_store
// (build request normalizes to app_store before the gate; for standalone scans the
// over-eager direction is safe because the triplet check below still gates it).
export function willUploadToAppStore(ctx: ScanContext): boolean {
  if (ctx.platform !== 'ios')
    return false
  const mode = ctx.distributionMode ?? 'app_store'
  if (mode !== 'app_store')
    return false
  const c = ctx.credentials
  return Boolean(c?.APPLE_KEY_ID && c?.APPLE_ISSUER_ID && c?.APPLE_KEY_CONTENT)
}
