import { type } from 'arktype'
import { literalUnion } from './ark_validation.ts'
import { Constants } from './supabase.types.ts'
import { deviceIdRegex, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, reverseDomainRegex } from './utils.ts'

export const MAX_QUERY_TEXT_LENGTH = 512
export const MAX_QUERY_LIMIT = 50_000

export const appIdSchema = type('string').narrow((value, ctx) => {
  if (!reverseDomainRegex.test(value)) {
    return ctx.reject({
      expected: INVALID_STRING_APP_ID,
      actual: JSON.stringify(value),
    })
  }
  return true
})

export const deviceIdSchema = type('string <= 36').narrow((value, ctx) => {
  if (!deviceIdRegex.test(value)) {
    return ctx.reject({
      expected: INVALID_STRING_DEVICE_ID,
      actual: JSON.stringify(value),
    })
  }
  return true
})

export const safeQueryTextSchema = type(`string <= ${MAX_QUERY_TEXT_LENGTH}`)
export const safeQueryDateSchema = type('string <= 128')
export const cursorSchema = type('string <= 128')
const queryLimitNumberSchema = type('number.integer >= 1').narrow((value, ctx) => {
  if (value > MAX_QUERY_LIMIT) {
    return ctx.reject({
      expected: `a value <= ${MAX_QUERY_LIMIT}`,
      actual: JSON.stringify(value),
    })
  }

  return true
})

const queryLimitStringSchema = type('string.numeric.parse |> number.integer >= 1').narrow((value, ctx) => {
  if (value > MAX_QUERY_LIMIT) {
    return ctx.reject({
      expected: `a value <= ${MAX_QUERY_LIMIT}`,
      actual: JSON.stringify(value),
    })
  }

  return true
})

export const queryLimitSchema = queryLimitNumberSchema.or(queryLimitStringSchema)
export const statsActionSchema = literalUnion(Constants.public.Enums.stats_action)

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
