import { z } from 'zod/mini'
import { Constants } from './supabase.types.ts'
import { deviceIdRegex, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, MISSING_STRING_APP_ID, NON_STRING_APP_ID, reverseDomainRegex } from './utils.ts'

export const MAX_QUERY_TEXT_LENGTH = 512
export const MAX_QUERY_LIMIT = 50_000

export const appIdSchema = z.string({
  error: issue => issue.input === undefined ? MISSING_STRING_APP_ID : NON_STRING_APP_ID,
}).check(z.regex(reverseDomainRegex, { message: INVALID_STRING_APP_ID }))

export const deviceIdSchema = z.string().check(
  z.maxLength(36),
  z.regex(deviceIdRegex, { message: INVALID_STRING_DEVICE_ID }),
)

export const safeQueryTextSchema = z.string().check(z.maxLength(MAX_QUERY_TEXT_LENGTH))
export const safeQueryDateSchema = z.string().check(z.maxLength(128))
export const cursorSchema = z.string().check(z.maxLength(128))
export const queryLimitSchema = z.coerce.number().check(z.int(), z.minimum(1), z.maximum(MAX_QUERY_LIMIT))
export const statsActionSchema = z.enum(Constants.public.Enums.stats_action)

export function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.codePointAt(i) ?? 0
    if ((code >= 0 && code <= 31) || code === 127)
      return true
  }
  return false
}

export function hasUnsafeQueryText(value: string | undefined, maxLength = MAX_QUERY_TEXT_LENGTH): boolean {
  if (value === undefined)
    return false
  return value.length > maxLength || hasControlChars(value)
}

export function hasInvalidQueryLimitInput(value: unknown): boolean {
  return value !== undefined && typeof value !== 'number' && typeof value !== 'string'
}

export function hasUnsafeStatsQueryText(body: {
  search?: string
  rangeStart?: string | number
  rangeEnd?: string | number
}): boolean {
  return hasUnsafeQueryText(body.search)
    || (typeof body.rangeStart === 'string' && hasUnsafeQueryText(body.rangeStart, 128))
    || (typeof body.rangeEnd === 'string' && hasUnsafeQueryText(body.rangeEnd, 128))
}

export function hasUnsafeDevicesQueryText(body: {
  versionName?: string
  search?: string
  cursor?: string
  order?: { key: string }[]
}): boolean {
  return hasUnsafeQueryText(body.versionName)
    || hasUnsafeQueryText(body.search)
    || hasUnsafeQueryText(body.cursor, 128)
    || body.order?.some(item => hasUnsafeQueryText(item.key, 64))
    || false
}
