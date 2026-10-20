import type { BentoTrackingPayload } from './tracking.ts'
import { ALERT_UPLOAD_SIZE_BYTES } from '../files/util.ts'

/**
 * CLI `bundle upload` emits this when the zipped bundle is over the alert
 * threshold (20 MB) but still under the hard max, and the zip is actually
 * uploaded (`--delta-only` / `--partial-only` skip it). PostHog already
 * records it; this helper builds the Bento payload so org admins can get a
 * lifecycle automation / email.
 */
export const APP_TOO_LARGE_EVENT = 'App Too Large'
export const APP_TOO_LARGE_BENTO_EVENT = 'app_too_large'

const DEFAULT_THRESHOLD_MB = Math.floor(ALERT_UPLOAD_SIZE_BYTES / 1024 / 1024)
const DEFAULT_RECOMMENDED_SIZE_MB = DEFAULT_THRESHOLD_MB

export interface AppTooLargeBentoInput {
  event: string
  orgId: string | undefined
  appId: string | undefined
  orgName?: string
  appName?: string
  tags?: Record<string, string | number | boolean>
}

function parseMbTag(
  tags: Record<string, string | number | boolean> | undefined,
  key: string,
): number | undefined {
  const raw = tags?.[key]
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0)
    return raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.length > 0) {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed) && parsed >= 0)
        return parsed
    }
  }
  return undefined
}

function resolveBundleSizeMb(tags: Record<string, string | number | boolean> | undefined): number | undefined {
  return parseMbTag(tags, 'bundle_size_mb') ?? parseMbTag(tags, 'size_mb')
}

/**
 * Pure: emit a Bento signal for oversized bundle uploads. Returns undefined
 * when the event name does not match or org/app context is missing.
 */
export function buildAppTooLargeBentoEvent(input: AppTooLargeBentoInput): BentoTrackingPayload | undefined {
  if (input.event !== APP_TOO_LARGE_EVENT)
    return undefined
  if (!input.orgId || !input.appId)
    return undefined

  const bundleSizeMb = resolveBundleSizeMb(input.tags)
  const thresholdMb = parseMbTag(input.tags, 'threshold_mb') ?? DEFAULT_THRESHOLD_MB
  const recommendedSizeMb = parseMbTag(input.tags, 'recommended_size_mb') ?? DEFAULT_RECOMMENDED_SIZE_MB

  return {
    cron: '* * * * *',
    event: APP_TOO_LARGE_BENTO_EVENT,
    preferenceKey: 'app_too_large',
    uniqId: `${APP_TOO_LARGE_BENTO_EVENT}:${input.appId}`,
    data: {
      org_id: input.orgId,
      org_name: input.orgName ?? '',
      app_id: input.appId,
      app_name: input.appName ?? '',
      threshold_mb: thresholdMb,
      recommended_size_mb: recommendedSizeMb,
      ...(bundleSizeMb === undefined ? {} : { size_mb: bundleSizeMb, bundle_size_mb: bundleSizeMb }),
    },
  }
}
