import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, headers, resetAndSeedAppData, resetAppData, getSupabaseClient, ORG_ID, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.app.default.channel.${id}`

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})

afterAll(async () => {
  await resetAppData(APPNAME)
})

describe('Default Channel Validation Tests', () => {
  describe('Valid configurations', () => {
    it('should allow one public channel with all platforms enabled', async () => {
      const response = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME,
          channel: 'default_all_platforms',
          public: true,
          ios: true,
          android: true,
          electron: true,
        }),
      })

      const data = await response.json<{ status: string }>()
      expect(response.status).toBe(200)
      expect(data.status).toBe('ok')

      // Verify the channel was created
      const { data: channel } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('app_id', APPNAME)
        .eq('name', 'default_all_platforms')
        .single()

      expect(channel).toBeTruthy()
      expect(channel?.public).toBe(true)
      expect(channel?.ios).toBe(true)
      expect(channel?.android).toBe(true)
      expect(channel?.electron).toBe(true)
    })

    it('should allow three public channels with one platform each', async () => {
      const id2 = randomUUID()
      const APPNAME2 = `com.app.three.channels.${id2}`
      await resetAndSeedAppData(APPNAME2)

      // Create iOS-only public channel
      const response1 = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME2,
          channel: 'ios_only',
          public: true,
          ios: true,
          android: false,
          electron: false,
        }),
      })
      expect(response1.status).toBe(200)

      // Create Android-only public channel
      const response2 = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME2,
          channel: 'android_only',
          public: true,
          ios: false,
          android: true,
          electron: false,
        }),
      })
      expect(response2.status).toBe(200)

      // Create Electron-only public channel
      const response3 = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME2,
          channel: 'electron_only',
          public: true,
          ios: false,
          android: false,
          electron: true,
        }),
      })
      expect(response3.status).toBe(200)

      // Verify all three channels exist
      const { data: channels } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('app_id', APPNAME2)
        .eq('public', true)

      expect(channels?.length).toBeGreaterThanOrEqual(3)

      await resetAppData(APPNAME2)
    })

    it('should allow combination of platform-specific public channels', async () => {
      const id3 = randomUUID()
      const APPNAME3 = `com.app.combo.${id3}`
      await resetAndSeedAppData(APPNAME3)

      // Create iOS + Android public channel
      const response1 = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME3,
          channel: 'ios_android',
          public: true,
          ios: true,
          android: true,
          electron: false,
        }),
      })
      expect(response1.status).toBe(200)

      // Create Electron-only public channel
      const response2 = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME3,
          channel: 'electron_only',
          public: true,
          ios: false,
          android: false,
          electron: true,
        }),
      })
      expect(response2.status).toBe(200)

      // Verify both channels exist
      const { data: channels } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('app_id', APPNAME3)
        .eq('public', true)

      expect(channels?.length).toBeGreaterThanOrEqual(2)

      await resetAppData(APPNAME3)
    })
  })

  describe('Invalid configurations - Maximum channel limit', () => {
    it('should reject creating a 4th public channel', async () => {
      const id4 = randomUUID()
      const APPNAME4 = `com.app.four.channels.${id4}`
      await resetAndSeedAppData(APPNAME4)

      // Create 3 public channels first
      await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME4,
          channel: 'channel1',
          public: true,
          ios: true,
          android: false,
          electron: false,
        }),
      })

      await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME4,
          channel: 'channel2',
          public: true,
          ios: false,
          android: true,
          electron: false,
        }),
      })

      await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME4,
          channel: 'channel3',
          public: true,
          ios: false,
          android: false,
          electron: true,
        }),
      })

      // Attempt to create a 4th public channel should fail
      const response = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME4,
          channel: 'channel4',
          public: true,
          ios: true,
          android: false,
          electron: false,
        }),
      })

      expect(response.status).toBe(400)
      const errorData = await response.json<{ error: string, message: string }>()
      expect(errorData.error).toBe('max_public_channels')
      expect(errorData.message).toContain('Maximum 3 public channels')

      await resetAppData(APPNAME4)
    })
  })

  describe('Invalid configurations - Platform duplicates', () => {
    it('should reject creating 2 public channels both with iOS enabled', async () => {
      const id5 = randomUUID()
      const APPNAME5 = `com.app.duplicate.ios.${id5}`
      await resetAndSeedAppData(APPNAME5)

      // Create first iOS public channel
      const response1 = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME5,
          channel: 'ios_channel1',
          public: true,
          ios: true,
          android: false,
          electron: false,
        }),
      })
      expect(response1.status).toBe(200)

      // Attempt to create second iOS public channel should fail
      const response2 = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME5,
          channel: 'ios_channel2',
          public: true,
          ios: true,
          android: false,
          electron: false,
        }),
      })

      expect(response2.status).toBe(400)
      const errorData = await response2.json<{ error: string, message: string }>()
      expect(errorData.error).toBe('duplicate_platform_ios')
      expect(errorData.message).toContain('already supports iOS platform')

      await resetAppData(APPNAME5)
    })

    it('should reject creating 2 public channels both with Android enabled', async () => {
      const id6 = randomUUID()
      const APPNAME6 = `com.app.duplicate.android.${id6}`
      await resetAndSeedAppData(APPNAME6)

      // Create first Android public channel
      const response1 = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME6,
          channel: 'android_channel1',
          public: true,
          ios: false,
          android: true,
          electron: false,
        }),
      })
      expect(response1.status).toBe(200)

      // Attempt to create second Android public channel should fail
      const response2 = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME6,
          channel: 'android_channel2',
          public: true,
          ios: false,
          android: true,
          electron: false,
        }),
      })

      expect(response2.status).toBe(400)
      const errorData = await response2.json<{ error: string, message: string }>()
      expect(errorData.error).toBe('duplicate_platform_android')
      expect(errorData.message).toContain('already supports Android platform')

      await resetAppData(APPNAME6)
    })

    it('should reject creating 2 public channels both with Electron enabled', async () => {
      const id7 = randomUUID()
      const APPNAME7 = `com.app.duplicate.electron.${id7}`
      await resetAndSeedAppData(APPNAME7)

      // Create first Electron public channel
      const response1 = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME7,
          channel: 'electron_channel1',
          public: true,
          ios: false,
          android: false,
          electron: true,
        }),
      })
      expect(response1.status).toBe(200)

      // Attempt to create second Electron public channel should fail
      const response2 = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME7,
          channel: 'electron_channel2',
          public: true,
          ios: false,
          android: false,
          electron: true,
        }),
      })

      expect(response2.status).toBe(400)
      const errorData = await response2.json<{ error: string, message: string }>()
      expect(errorData.error).toBe('duplicate_platform_electron')
      expect(errorData.message).toContain('already supports Electron platform')

      await resetAppData(APPNAME7)
    })

    it('should reject updating an existing public channel to conflict with another', async () => {
      const id8 = randomUUID()
      const APPNAME8 = `com.app.update.conflict.${id8}`
      await resetAndSeedAppData(APPNAME8)

      // Create iOS-only public channel
      await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME8,
          channel: 'ios_only',
          public: true,
          ios: true,
          android: false,
          electron: false,
        }),
      })

      // Create Android-only public channel
      await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME8,
          channel: 'android_only',
          public: true,
          ios: false,
          android: true,
          electron: false,
        }),
      })

      // Attempt to update Android channel to also enable iOS (conflict)
      const response = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME8,
          channel: 'android_only',
          public: true,
          ios: true, // This would conflict
          android: true,
          electron: false,
        }),
      })

      expect(response.status).toBe(400)
      const errorData = await response.json<{ error: string, message: string }>()
      expect(errorData.error).toBe('duplicate_platform_ios')

      await resetAppData(APPNAME8)
    })
  })

  describe('Private channels should not be affected', () => {
    it('should allow multiple private channels regardless of platform', async () => {
      const id9 = randomUUID()
      const APPNAME9 = `com.app.private.${id9}`
      await resetAndSeedAppData(APPNAME9)

      // Create multiple private channels with same platforms - should all succeed
      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${BASE_URL}/channel`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            app_id: APPNAME9,
            channel: `private_channel_${i}`,
            public: false,
            ios: true,
            android: true,
            electron: true,
          }),
        })
        expect(response.status).toBe(200)
      }

      // Verify all 5+ private channels exist (including seeded ones)
      const { data: channels } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('app_id', APPNAME9)
        .eq('public', false)

      expect(channels?.length).toBeGreaterThanOrEqual(5)

      await resetAppData(APPNAME9)
    })
  })
})
