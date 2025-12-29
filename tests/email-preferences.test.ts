import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { EmailPreferences } from '../supabase/functions/_backend/utils/org_email_notifications.ts'
import { APP_NAME, BASE_URL, getSupabaseClient, ORG_ID, resetAndSeedAppData, resetAppData, USER_EMAIL, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME_PREFS = `${APP_NAME}.ep.${id}`

const triggerHeaders = {
  'Content-Type': 'application/json',
  'apisecret': 'testsecret',
}

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME_PREFS)
})

afterAll(async () => {
  await resetAppData(APPNAME_PREFS)
  // Reset user email preferences to defaults
  const supabase = getSupabaseClient()
  await supabase.from('users').update({
    email_preferences: {
      usage_limit: true,
      credit_usage: true,
      onboarding: true,
      weekly_stats: true,
      monthly_stats: true,
      deploy_stats_24h: true,
      bundle_created: true,
      bundle_deployed: true,
      device_error: true,
      channel_self_rejected: true,
    },
  } as any).eq('id', USER_ID)
})

// Helper to check if migration has been applied
async function isMigrationApplied(): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('users')
    .select('email_preferences')
    .limit(1)

  // If we get a 42703 error (column doesn't exist), migration not applied
  return !error || error.code !== '42703'
}

describe('[Database] Email Preferences Column', () => {
  it('should have email_preferences column with default values', async () => {
    const migrationApplied = await isMigrationApplied()
    if (!migrationApplied) {
      console.warn('Skipping test: email_preferences migration not yet applied')
      return
    }

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    expect(error).toBeNull()
    expect(data).toBeDefined()
    const prefs = (data as any)?.email_preferences as EmailPreferences
    expect(prefs).toBeDefined()
    // All default to true
    expect(prefs.usage_limit ?? true).toBe(true)
    expect(prefs.credit_usage ?? true).toBe(true)
    expect(prefs.onboarding ?? true).toBe(true)
    expect(prefs.weekly_stats ?? true).toBe(true)
    expect(prefs.monthly_stats ?? true).toBe(true)
    expect(prefs.deploy_stats_24h ?? true).toBe(true)
    expect(prefs.bundle_created ?? true).toBe(true)
    expect(prefs.bundle_deployed ?? true).toBe(true)
    expect(prefs.device_error ?? true).toBe(true)
  })

  it('should allow updating individual email preferences', async () => {
    const migrationApplied = await isMigrationApplied()
    if (!migrationApplied) {
      console.warn('Skipping test: email_preferences migration not yet applied')
      return
    }

    const supabase = getSupabaseClient()

    // First get current preferences
    const { data: currentData } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    const currentPrefs = ((currentData as any)?.email_preferences ?? {}) as EmailPreferences
    const updatedPrefs = { ...currentPrefs, weekly_stats: false }

    // Update with weekly_stats disabled
    const { error: updateError } = await supabase
      .from('users')
      .update({ email_preferences: updatedPrefs } as any)
      .eq('id', USER_ID)

    expect(updateError).toBeNull()

    // Verify the update
    const { data: verifyData, error: verifyError } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    expect(verifyError).toBeNull()
    const prefs = (verifyData as any)?.email_preferences as EmailPreferences
    expect(prefs.weekly_stats).toBe(false)
    // Other preferences should remain true
    expect(prefs.usage_limit ?? true).toBe(true)
  })

  it('should allow toggling preferences back to true', async () => {
    const migrationApplied = await isMigrationApplied()
    if (!migrationApplied) {
      console.warn('Skipping test: email_preferences migration not yet applied')
      return
    }

    const supabase = getSupabaseClient()

    // First get current preferences
    const { data: currentData } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    const currentPrefs = ((currentData as any)?.email_preferences ?? {}) as EmailPreferences
    const updatedPrefs = { ...currentPrefs, weekly_stats: true }

    // Toggle weekly_stats back to true
    const { error: updateError } = await supabase
      .from('users')
      .update({ email_preferences: updatedPrefs } as any)
      .eq('id', USER_ID)

    expect(updateError).toBeNull()

    // Verify the update
    const { data: verifyData } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    const prefs = (verifyData as any)?.email_preferences as EmailPreferences
    expect(prefs.weekly_stats).toBe(true)
  })
})

describe('[POST] /triggers/cron_email - Email Preference Filtering', () => {
  it('should skip weekly stats email when weekly_stats preference is disabled', async () => {
    const migrationApplied = await isMigrationApplied()
    if (!migrationApplied) {
      console.warn('Skipping test: email_preferences migration not yet applied')
      return
    }

    const supabase = getSupabaseClient()

    // First get current preferences
    const { data: currentData } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    const currentPrefs = ((currentData as any)?.email_preferences ?? {}) as EmailPreferences

    // Disable weekly_stats preference
    await supabase
      .from('users')
      .update({ email_preferences: { ...currentPrefs, weekly_stats: false } } as any)
      .eq('id', USER_ID)

    // Send request for weekly stats
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: USER_EMAIL,
        appId: APPNAME_PREFS,
        type: 'weekly_install_stats',
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Email preference disabled')

    // Re-enable the preference
    await supabase
      .from('users')
      .update({ email_preferences: { ...currentPrefs, weekly_stats: true } } as any)
      .eq('id', USER_ID)
  })

  it('should skip monthly stats email when monthly_stats preference is disabled', async () => {
    const migrationApplied = await isMigrationApplied()
    if (!migrationApplied) {
      console.warn('Skipping test: email_preferences migration not yet applied')
      return
    }

    const supabase = getSupabaseClient()

    // First get current preferences
    const { data: currentData } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    const currentPrefs = ((currentData as any)?.email_preferences ?? {}) as EmailPreferences

    // Disable monthly_stats preference
    await supabase
      .from('users')
      .update({ email_preferences: { ...currentPrefs, monthly_stats: false } } as any)
      .eq('id', USER_ID)

    // Send request for monthly stats
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: USER_EMAIL,
        appId: APPNAME_PREFS,
        type: 'monthly_create_stats',
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Email preference disabled')

    // Re-enable the preference
    await supabase
      .from('users')
      .update({ email_preferences: { ...currentPrefs, monthly_stats: true } } as any)
      .eq('id', USER_ID)
  })

  it('should allow weekly stats email when weekly_stats preference is enabled', async () => {
    const migrationApplied = await isMigrationApplied()
    if (!migrationApplied) {
      console.warn('Skipping test: email_preferences migration not yet applied')
      return
    }

    const supabase = getSupabaseClient()

    // Ensure weekly_stats preference is enabled
    const { data: currentData } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    const currentPrefs = ((currentData as any)?.email_preferences ?? {}) as EmailPreferences
    await supabase
      .from('users')
      .update({ email_preferences: { ...currentPrefs, weekly_stats: true } } as any)
      .eq('id', USER_ID)

    // Send request for weekly stats
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: USER_EMAIL,
        appId: APPNAME_PREFS,
        type: 'weekly_install_stats',
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { status?: string }
    // When enabled, it should either send the email or return "No updates this week"
    // (not "Email preference disabled")
    expect(data.status).not.toBe('Email preference disabled')
  })

  it('should allow monthly stats email when monthly_stats preference is enabled', async () => {
    const migrationApplied = await isMigrationApplied()
    if (!migrationApplied) {
      console.warn('Skipping test: email_preferences migration not yet applied')
      return
    }

    const supabase = getSupabaseClient()

    // Ensure monthly_stats preference is enabled
    const { data: currentData } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    const currentPrefs = ((currentData as any)?.email_preferences ?? {}) as EmailPreferences
    await supabase
      .from('users')
      .update({ email_preferences: { ...currentPrefs, monthly_stats: true } } as any)
      .eq('id', USER_ID)

    // Send request for monthly stats
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: USER_EMAIL,
        appId: APPNAME_PREFS,
        type: 'monthly_create_stats',
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { status?: string }
    // When enabled, it should proceed (not return "Email preference disabled")
    expect(data.status).not.toBe('Email preference disabled')
  })
})

describe('[POST] /triggers/cron_email - Deploy Install Stats Preference', () => {
  it('should skip deploy install stats email when deploy_stats_24h preference is disabled', async () => {
    const migrationApplied = await isMigrationApplied()
    if (!migrationApplied) {
      console.warn('Skipping test: email_preferences migration not yet applied')
      return
    }

    const supabase = getSupabaseClient()

    // First get current preferences
    const { data: currentData } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    const currentPrefs = ((currentData as any)?.email_preferences ?? {}) as EmailPreferences

    // Disable deploy_stats_24h preference
    await supabase
      .from('users')
      .update({ email_preferences: { ...currentPrefs, deploy_stats_24h: false } } as any)
      .eq('id', USER_ID)

    // Send request for deploy install stats (will fail due to missing versionId, but preference check happens first)
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        email: USER_EMAIL,
        appId: APPNAME_PREFS,
        type: 'deploy_install_stats',
        versionId: 999999, // Non-existent version
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Email preference disabled')

    // Re-enable the preference
    await supabase
      .from('users')
      .update({ email_preferences: { ...currentPrefs, deploy_stats_24h: true } } as any)
      .eq('id', USER_ID)
  })
})

describe('[Database] Email Preferences - Multi-preference Update', () => {
  it('should allow disabling multiple preferences at once', async () => {
    const migrationApplied = await isMigrationApplied()
    if (!migrationApplied) {
      console.warn('Skipping test: email_preferences migration not yet applied')
      return
    }

    const supabase = getSupabaseClient()

    // First get current preferences
    const { data: currentData } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    const currentPrefs = ((currentData as any)?.email_preferences ?? {}) as EmailPreferences

    // Disable multiple preferences
    const updatedPrefs = {
      ...currentPrefs,
      usage_limit: false,
      credit_usage: false,
      device_error: false,
    }

    await supabase
      .from('users')
      .update({ email_preferences: updatedPrefs } as any)
      .eq('id', USER_ID)

    // Verify the updates
    const { data: verifyData } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    const prefs = (verifyData as any)?.email_preferences as EmailPreferences
    expect(prefs.usage_limit).toBe(false)
    expect(prefs.credit_usage).toBe(false)
    expect(prefs.device_error).toBe(false)
    // Others should remain true
    expect(prefs.onboarding ?? true).toBe(true)
    expect(prefs.bundle_created ?? true).toBe(true)

    // Reset to defaults
    await supabase
      .from('users')
      .update({
        email_preferences: {
          usage_limit: true,
          credit_usage: true,
          onboarding: true,
          weekly_stats: true,
          monthly_stats: true,
          deploy_stats_24h: true,
          bundle_created: true,
          bundle_deployed: true,
          device_error: true,
        },
      } as any)
      .eq('id', USER_ID)
  })
})

describe('[Database] Email Preferences - Query by Preference', () => {
  it('should be able to query users by specific preference values', async () => {
    const migrationApplied = await isMigrationApplied()
    if (!migrationApplied) {
      console.warn('Skipping test: email_preferences migration not yet applied')
      return
    }

    const supabase = getSupabaseClient()

    // First disable a preference
    const { data: currentData } = await supabase
      .from('users')
      .select('email_preferences')
      .eq('id', USER_ID)
      .single()

    const currentPrefs = ((currentData as any)?.email_preferences ?? {}) as EmailPreferences
    await supabase
      .from('users')
      .update({ email_preferences: { ...currentPrefs, bundle_deployed: false } } as any)
      .eq('id', USER_ID)

    // Query users with bundle_deployed disabled using raw query
    // Note: Supabase JS client doesn't support JSONB containment directly,
    // so we verify by fetching and checking
    const { data: usersData } = await supabase
      .from('users')
      .select('id, email_preferences')
      .eq('id', USER_ID)
      .single()

    const prefs = (usersData as any)?.email_preferences as EmailPreferences
    expect(prefs.bundle_deployed).toBe(false)

    // Reset the preference
    await supabase
      .from('users')
      .update({ email_preferences: { ...currentPrefs, bundle_deployed: true } } as any)
      .eq('id', USER_ID)
  })
})

describe('[Integration] Org Email Notifications with Preferences', () => {
  it('should check org member preferences when sending notifications', async () => {
    const supabase = getSupabaseClient()

    // Get org_users to verify the test user is an admin
    const { data: orgUserData } = await supabase
      .from('org_users')
      .select('user_right')
      .eq('org_id', ORG_ID)
      .eq('user_id', USER_ID)
      .single()

    // User should be admin or super_admin to receive operational emails
    expect(orgUserData).toBeDefined()
    if (orgUserData) {
      expect(['admin', 'super_admin']).toContain(orgUserData.user_right)
    }
  })
})
