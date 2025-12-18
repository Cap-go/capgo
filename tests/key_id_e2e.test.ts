import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { APP_NAME, getBaseData, getEndpointUrl, getSupabaseClient, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const id = randomUUID()
const APP_NAME_KEY_ID = `${APP_NAME}.${id}`

beforeAll(async () => {
  await resetAndSeedAppData(APP_NAME_KEY_ID)
})

afterAll(async () => {
  await resetAppData(APP_NAME_KEY_ID)
  await resetAppDataStats(APP_NAME_KEY_ID)
})

describe('e2E: /updates endpoint with key_id', () => {
  const supabase = getSupabaseClient()

  it('should accept request WITHOUT key_id (old client)', async () => {
    const deviceId = randomUUID().toLowerCase()
    const baseData = getBaseData(APP_NAME_KEY_ID)
    baseData.device_id = deviceId

    const response = await fetch(getEndpointUrl('/updates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseData),
    })

    expect(response.status).toBe(200)

    // Verify device was saved without key_id
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('app_id', APP_NAME_KEY_ID)
      .eq('device_id', deviceId)
      .maybeSingle() as { data: any }

    expect(data?.key_id).toBeNull()
  })

  it('should accept request WITH key_id (new client with encryption)', async () => {
    const deviceId = randomUUID().toLowerCase()
    const baseData = getBaseData(APP_NAME_KEY_ID)
    baseData.device_id = deviceId

    const response = await fetch(getEndpointUrl('/updates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseData,
        key_id: 'MIIB',
      }),
    })

    expect(response.status).toBe(200)

    // Verify device was saved with key_id
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('app_id', APP_NAME_KEY_ID)
      .eq('device_id', deviceId)
      .maybeSingle() as { data: any }

    expect(data?.key_id).toBe('MIIB')
  })

  it('should reject key_id longer than 4 characters', async () => {
    const baseData = getBaseData(APP_NAME_KEY_ID)

    const response = await fetch(getEndpointUrl('/updates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseData,
        key_id: 'TOOLONG', // 7 characters
      }),
    })

    expect(response.status).toBe(400)
  })

  it('should update key_id on key rotation', async () => {
    const deviceId = randomUUID().toLowerCase()
    const baseData = getBaseData(APP_NAME_KEY_ID)
    baseData.device_id = deviceId

    // First request with key1
    await fetch(getEndpointUrl('/updates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseData,
        key_id: 'KEY1',
      }),
    })

    // Second request with key2 (rotation)
    await fetch(getEndpointUrl('/updates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseData,
        key_id: 'KEY2',
      }),
    })

    // Verify key was updated
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('app_id', APP_NAME_KEY_ID)
      .eq('device_id', deviceId)
      .maybeSingle() as { data: any }

    expect(data?.key_id).toBe('KEY2')
  })
})

describe('e2E: /stats endpoint with key_id', () => {
  const supabase = getSupabaseClient()

  it('should accept request WITHOUT key_id (old client)', async () => {
    const deviceId = randomUUID().toLowerCase()
    const baseData = getBaseData(APP_NAME_KEY_ID)
    baseData.device_id = deviceId

    const response = await fetch(getEndpointUrl('/stats'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseData,
        action: 'set',
      }),
    })

    expect(response.status).toBe(200)

    // Verify device was saved without key_id
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('app_id', APP_NAME_KEY_ID)
      .eq('device_id', deviceId)
      .maybeSingle() as { data: any }

    expect(data?.key_id).toBeNull()
  })

  it('should accept request WITH key_id (new client)', async () => {
    const deviceId = randomUUID().toLowerCase()
    const baseData = getBaseData(APP_NAME_KEY_ID)
    baseData.device_id = deviceId

    const response = await fetch(getEndpointUrl('/stats'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseData,
        action: 'set',
        key_id: 'TEST',
      }),
    })

    expect(response.status).toBe(200)

    // Verify device was saved with key_id
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('app_id', APP_NAME_KEY_ID)
      .eq('device_id', deviceId)
      .maybeSingle() as { data: any }

    expect(data?.key_id).toBe('TEST')
  })

  it('should reject key_id longer than 4 characters', async () => {
    const baseData = getBaseData(APP_NAME_KEY_ID)

    const response = await fetch(getEndpointUrl('/stats'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseData,
        action: 'set',
        key_id: 'WAYTOLONG',
      }),
    })

    expect(response.status).toBe(400)
  })
})

describe('e2E: /channel_self endpoint with key_id', () => {
  const supabase = getSupabaseClient()

  it('should accept POST request WITHOUT key_id (old client)', async () => {
    const deviceId = randomUUID().toLowerCase()
    const baseData = getBaseData(APP_NAME_KEY_ID)
    baseData.device_id = deviceId

    const response = await fetch(getEndpointUrl('/channel_self'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseData),
    })

    expect(response.status).toBe(200)

    // Verify device was saved without key_id
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('app_id', APP_NAME_KEY_ID)
      .eq('device_id', deviceId)
      .maybeSingle() as { data: any }

    expect(data?.key_id).toBeNull()
  })

  it('should accept POST request WITH key_id (new client)', async () => {
    const deviceId = randomUUID().toLowerCase()
    const baseData = getBaseData(APP_NAME_KEY_ID)
    baseData.device_id = deviceId

    const response = await fetch(getEndpointUrl('/channel_self'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseData,
        key_id: 'CHAN',
      }),
    })

    expect(response.status).toBe(200)

    // Verify device was saved with key_id
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('app_id', APP_NAME_KEY_ID)
      .eq('device_id', deviceId)
      .maybeSingle() as { data: any }

    expect(data?.key_id).toBe('CHAN')
  })

  it('should reject key_id longer than 4 characters in POST', async () => {
    const baseData = getBaseData(APP_NAME_KEY_ID)

    const response = await fetch(getEndpointUrl('/channel_self'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseData,
        key_id: 'INVALID',
      }),
    })

    expect(response.status).toBe(400)
  })

  it('should accept GET request WITHOUT key_id (old client)', async () => {
    const baseData = getBaseData(APP_NAME_KEY_ID)
    const params = new URLSearchParams()
    params.append('app_id', baseData.app_id!)
    params.append('platform', baseData.platform!)
    params.append('is_emulator', baseData.is_emulator!.toString())
    params.append('is_prod', baseData.is_prod!.toString())

    const response = await fetch(`${getEndpointUrl('/channel_self')}?${params}`, {
      method: 'GET',
    })

    expect(response.status).toBe(200)
  })

  it('should accept GET request WITH key_id (new client)', async () => {
    const baseData = getBaseData(APP_NAME_KEY_ID)
    const params = new URLSearchParams()
    params.append('app_id', baseData.app_id!)
    params.append('platform', baseData.platform!)
    params.append('is_emulator', baseData.is_emulator!.toString())
    params.append('is_prod', baseData.is_prod!.toString())
    params.append('key_id', 'GETS')

    const response = await fetch(`${getEndpointUrl('/channel_self')}?${params}`, {
      method: 'GET',
    })

    expect(response.status).toBe(200)
  })
})
