import { randomUUID } from 'node:crypto'

import type { Database } from '../src/types/supabase.types'
import dayjs from 'dayjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { BASE_URL, getSupabaseClient, headersInternal, PRODUCT_ID, TEST_EMAIL, USER_ID } from './test-utils.ts'

const supabase = getSupabaseClient()

const APP_ID = `com.storage.${randomUUID().slice(0, 8)}`
const ORG_ID = randomUUID()
const CUSTOMER_ID = `cus_${randomUUID().slice(0, 8)}`
const VERSION_SIZE = 5_000_000

const now = dayjs()
const subscriptionStartDayjs = now.subtract(7, 'day')
const subscriptionEndDayjs = subscriptionStartDayjs.clone().add(1, 'month')
const versionAddTimestampDayjs = subscriptionStartDayjs.clone().add(2, 'day').add(4, 'hour')
const currentHourDayjs = subscriptionStartDayjs.clone().add(4, 'day').add(8, 'hour')

const subscriptionStart = subscriptionStartDayjs.toISOString()
const subscriptionEnd = subscriptionEndDayjs.toISOString()
const versionAddTimestamp = versionAddTimestampDayjs.toISOString()
const currentHour = currentHourDayjs.toISOString()

beforeAll(async () => {
  const { error: stripeError } = await supabase.from('stripe_info').upsert([
    {
      subscription_id: `sub_${randomUUID().slice(0, 6)}`,
      customer_id: CUSTOMER_ID,
      status: 'succeeded' as const,
      product_id: PRODUCT_ID,
      trial_at: new Date(0).toISOString(),
      is_good_plan: true,
      plan_usage: 0,
      subscription_metered: {},
      subscription_anchor_start: subscriptionStart,
      subscription_anchor_end: subscriptionEnd,
      mau_exceeded: false,
      storage_exceeded: false,
      bandwidth_exceeded: false,
    },
  ], { onConflict: 'customer_id' })
  if (stripeError)
    throw stripeError

  const { error: orgError } = await supabase.from('orgs').upsert([
    {
      id: ORG_ID,
      customer_id: CUSTOMER_ID,
      name: 'Storage Hourly Test Org',
      created_by: USER_ID,
      management_email: TEST_EMAIL,
    },
  ], { onConflict: 'id' })
  if (orgError)
    throw orgError

  const { error: appError } = await supabase.from('apps').upsert([
    {
      owner_org: ORG_ID,
      name: 'Storage Cron App',
      app_id: APP_ID,
      icon_url: 'https://example.com/icon.png',
    },
  ], { onConflict: 'app_id' })
  if (appError)
    throw appError

  const { data: versionRows, error: versionError } = await supabase.from('app_versions').insert([
    {
      app_id: APP_ID,
      name: `1.0.0-${Date.now()}`,
      owner_org: ORG_ID,
    },
  ]).select('id').single()
  if (versionError)
    throw versionError
  if (!versionRows?.id)
    throw new Error('version creation failed')

  const versionMetaRows: Database['public']['Tables']['version_meta']['Insert'][] = [
    {
      timestamp: versionAddTimestamp,
      app_id: APP_ID,
      version_id: versionRows.id,
      size: VERSION_SIZE,
    },
  ]

  const { error: versionMetaError } = await supabase.from('version_meta').insert(versionMetaRows)
  if (versionMetaError)
    throw versionMetaError
})

beforeEach(async () => {
  const { error: deleteHourlyError } = await supabase.from('storage_hourly').delete().eq('app_id', APP_ID)
  if (deleteHourlyError)
    throw deleteHourlyError

  const { error: deleteCacheError } = await supabase.from('storage_hourly_cache').delete().eq('app_id', APP_ID)
  if (deleteCacheError)
    throw deleteCacheError
})

afterAll(async () => {
  await supabase.from('storage_hourly').delete().eq('app_id', APP_ID)
  await supabase.from('storage_hourly_cache').delete().eq('app_id', APP_ID)
  await supabase.from('version_meta').delete().eq('app_id', APP_ID)
  await supabase.from('app_versions').delete().eq('app_id', APP_ID)
  await supabase.from('apps').delete().eq('app_id', APP_ID)
  await supabase.from('orgs').delete().eq('id', ORG_ID)
  await supabase.from('stripe_info').delete().eq('customer_id', CUSTOMER_ID)
})

async function triggerCron(currentHourIso: string) {
  return await fetch(`${BASE_URL}/triggers/cron_hourly_storage`, {
    method: 'POST',
    headers: headersInternal,
    body: JSON.stringify({ app_id: APP_ID, current_hour: currentHourIso }),
  })
}

async function getHourlyRows() {
  const { data, error } = await supabase
    .from('storage_hourly')
    .select('date, size')
    .eq('app_id', APP_ID)
    .order('date', { ascending: true })

  if (error)
    throw error
  return data ?? []
}

describe('[POST] /triggers/cron_hourly_storage', () => {
  it('should build hourly storage records from version metadata', async () => {
    const response = await triggerCron(currentHour)
    expect(response.status).toBe(200)

    const hourlyRows = await getHourlyRows()
    expect(hourlyRows.length).toBeGreaterThan(0)

    const additionBoundary = versionAddTimestampDayjs.clone().startOf('hour')
    const rowsBeforeAddition = hourlyRows.filter(row => dayjs(row.date).isBefore(additionBoundary))
    expect(rowsBeforeAddition.every(row => row.size === 0)).toBe(true)

    const rowsAfterAddition = hourlyRows.filter(row => !dayjs(row.date).isBefore(additionBoundary))
    expect(rowsAfterAddition.some(row => row.size > 0)).toBe(true)

    const { data: cacheRow, error: cacheError } = await supabase
      .from('storage_hourly_cache')
      .select('cache')
      .eq('app_id', APP_ID)
      .single()

    expect(cacheError).toBeNull()
    expect(cacheRow?.cache).toBeTruthy()
    const cacheModified = (cacheRow?.cache as { cacheModified?: string })?.cacheModified
    expect(cacheModified).toBeTruthy()
    if (cacheModified)
      expect(dayjs(cacheModified).toISOString()).toBe(currentHourDayjs.toISOString())
  })

  it('should extend hourly data when the current hour advances by one hour', async () => {
    const initialResponse = await triggerCron(currentHour)
    expect(initialResponse.status).toBe(200)

    const baseRows = await getHourlyRows()
    const relevantBaseRows = baseRows.filter((row) => {
      const date = dayjs(row.date)
      return date.isBefore(currentHourDayjs) || date.isSame(currentHourDayjs)
    })
    expect(relevantBaseRows.length).toBeGreaterThan(0)
    const baseLastRow = relevantBaseRows[relevantBaseRows.length - 1]

    const advancedHourDayjs = currentHourDayjs.clone().add(1, 'hour')
    const advancedResponse = await triggerCron(advancedHourDayjs.toISOString())
    expect(advancedResponse.status).toBe(200)

    const advancedRows = await getHourlyRows()
    const relevantAdvancedRows = advancedRows.filter((row) => {
      const date = dayjs(row.date)
      return date.isBefore(advancedHourDayjs) || date.isSame(advancedHourDayjs)
    })

    expect(relevantAdvancedRows.length).toBe(relevantBaseRows.length + 1)

    const advancedLastRow = relevantAdvancedRows[relevantAdvancedRows.length - 1]
    // We allow a margin of error of 1 hours, because the data generation is based on the billing cycle, and we are avancing time using CURRENT time
    expect(Math.abs(dayjs(advancedLastRow.date).diff(advancedHourDayjs, 'minute'))).toBeLessThan(60)
    expect(advancedLastRow.size - baseLastRow.size).toBe(VERSION_SIZE)
  })
})
