import type { Page } from '@playwright/test'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseWorktreeConfig } from '../../scripts/supabase-worktree-config'
import { getSupabaseStatus } from '../../scripts/supabase-worktree-status'
import { expect, test } from '../support/commands'

const { ports: supabasePorts } = getSupabaseWorktreeConfig()
const localSupabaseUrl = `http://127.0.0.1:${supabasePorts.api}`
const localSupabaseAnonKey = env.SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

function localAdminClient() {
  const configured = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  const status = configured ? null : getSupabaseStatus()
  const key = configured || status?.SERVICE_ROLE_KEY || status?.SECRET_KEY
  if (!key)
    throw new Error('Local Supabase service key is required for treatment fixtures')
  return createClient(localSupabaseUrl, key, { auth: { persistSession: false } })
}

async function seedNameTreatment(userId: string) {
  const admin = localAdminClient()
  // Let the real signup handler finish its disabled allocation before seeding treatment.
  await expect.poll(async () => {
    const { data, error } = await admin.from('users').select('onboarding').eq('id', userId).single()
    if (error)
      throw error
    const current = data.onboarding && typeof data.onboarding === 'object' && !Array.isArray(data.onboarding) ? data.onboarding : {}
    return current.abtests_enrolled ?? []
  }, { timeout: 20000 }).toContain('onboarding_v6')
  const { data, error } = await admin.from('users').select('onboarding').eq('id', userId).single()
  if (error)
    throw error
  const current = data.onboarding && typeof data.onboarding === 'object' && !Array.isArray(data.onboarding) ? data.onboarding : {}
  const abtests = current.abtests && typeof current.abtests === 'object' && !Array.isArray(current.abtests) ? current.abtests : {}
  const { error: updateError } = await admin.from('users').update({ onboarding: {
    ...current,
    abtests: { ...abtests, onboarding_v6: { branch: 'A', assigned_at: '2026-10-19T11:00:00.000Z' } },
  } }).eq('id', userId)
  if (updateError)
    throw updateError
}

async function enableNameTreatmentFixture(page: Page) {
  // Simulate future treatment in local browser tests while the shipped flag stays at 0%.
  await page.route('**/auth/register', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    const response = await route.fetch()
    const body = await response.json()
    if (response.ok() && body.user?.id)
      await seedNameTreatment(body.user.id)
    await route.fulfill({ response })
  })
  await page.route('**/private/onboarding_ab_tests', async (route) => {
    // Do not invoke the real disabled allocator: it would remove this test's assignment.
    const headers = await route.request().allHeaders()
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        'Access-Control-Allow-Origin': headers.origin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': headers['access-control-request-headers'] || '*',
      } })
      return
    }
    const token = headers.authorization?.replace(/^Bearer /i, '')
    if (!token) {
      await route.fulfill({ status: 401, json: { error: 'not_authenticated' } })
      return
    }
    const admin = localAdminClient()
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    if (authError || !auth.user) {
      // A refresh already in flight can arrive after logout revoked the token.
      // Match the real endpoint's unauthenticated response in that case.
      await route.fulfill({ status: 401, json: { error: 'not_authenticated' } })
      return
    }
    const { data, error } = await admin.from('users').select('onboarding').eq('id', auth.user.id).single()
    if (error)
      throw error
    const current = data.onboarding && typeof data.onboarding === 'object' && !Array.isArray(data.onboarding) ? data.onboarding : {}
    const abtests = current.abtests && typeof current.abtests === 'object' && !Array.isArray(current.abtests) ? current.abtests : {}
    await route.fulfill({ json: { assignments: {
      ...abtests,
      onboarding_v6: { branch: 'A', assigned_at: '2026-10-19T11:00:00.000Z' },
    } } })
  })
}

async function loginToOnboarding(page: Page, email: string, password: string) {
  await page.login(email, password, /\/onboarding\/(?:name|app)/)
  if (new URL(page.url()).pathname === '/onboarding/name')
    await continuePastProfileWelcome(page)
}

async function continuePastProfileWelcome(page: Page) {
  const welcome = page.locator('[data-test="onboarding-welcome-continue"]')
  const name = page.locator('[data-test="onboarding-name-step"]')
  const resume = page.locator('[data-test="onboarding-resume-continue"]')
  await expect(welcome.or(name).or(resume)).toBeVisible()
  if (await resume.isVisible())
    await resume.click()
  await expect(welcome.or(name)).toBeVisible()
  if (await welcome.isVisible()) {
    await expect(name).toHaveCount(0)
    await welcome.click()
  }
  await expect(name).toBeVisible()
  await expect(page.locator('[data-test="onboarding-name-restart"]')).toHaveCount(0)
}

async function completeName(page: Page) {
  await continuePastProfileWelcome(page)
  await page.fill('[data-test="onboarding-first-name"]', 'Example')
  await page.fill('[data-test="onboarding-last-name"]', 'User')
  await page.click('[data-test="onboarding-name-continue"]')
  await page.waitForURL(/\/onboarding\/app/)
}

async function expectOnboardingGoal(page: Page) {
  await expect(page.locator('[data-test="onboarding-intent-ota"]')).toBeVisible()
  await expect(page.locator('[data-test="onboarding-welcome-continue"]')).toHaveCount(0)
  await expect(page.locator('nav[aria-label="Onboarding progress"] [aria-current="step"]')).toContainText('Your goal')
}

async function continuePastDevelopmentEnvironmentIfShown(page: Page) {
  const assistantOption = page.locator('[data-test="onboarding-development-environment-ai_assistant"]')
  const appNameInput = page.locator('[data-test="app-onboarding-name"]')
  await expect(assistantOption.or(appNameInput)).toBeVisible()
  if (await assistantOption.isVisible()) {
    await assistantOption.click()
    await page.click('[data-test="app-onboarding-continue-development-environment"]')
  }
}

async function continuePastChannelOnboardingIfShown(page: Page) {
  const cliSetup = page.locator('[data-test="onboarding-setup-cli"]')
  const routingContinue = page.locator('[data-test="channel-default-routing-continue"]')
  await expect(routingContinue.or(cliSetup)).toBeVisible({ timeout: 60000 })
  if (!await routingContinue.isVisible())
    return

  await routingContinue.click()
  await page.locator('[data-test="channel-self-assign-continue"]').click()
  await page.locator('[data-test="channel-console-assign-continue"]').click()

  const createChannel = page.locator('[data-test="channel-create-submit"]')
  const continueAfterChannel = page.locator('[data-test="channel-create-continue"]')
  await expect(createChannel.or(continueAfterChannel)).toBeVisible()
  if (await createChannel.isVisible()) {
    await page.locator('[data-test="channel-create-name"]').fill('production')
    await createChannel.click()
    await expect(continueAfterChannel).toBeVisible()
  }
  await continueAfterChannel.click()
  await expect(cliSetup).toBeVisible()
}

async function forceWebNativeOnboardingTreatments(email: string, password: string) {
  const supabase = createClient(localSupabaseUrl, localSupabaseAnonKey)
  const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError || !sessionData.user)
    throw signInError ?? new Error('Cannot sign in treatment user')

  // Experiment fixtures use a separate backend client; user sessions cannot
  // override the server-managed assignment fields.
  const configuredServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  const status = configuredServiceKey ? null : getSupabaseStatus()
  const serviceKey = configuredServiceKey || status?.SERVICE_ROLE_KEY || status?.SECRET_KEY
  if (!serviceKey)
    throw new Error('Local Supabase service key is required for treatment fixtures')
  const adminClient = createClient(localSupabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: profile, error: profileError } = await adminClient
    .from('users')
    .select('onboarding')
    .eq('id', sessionData.user.id)
    .single()
  if (profileError)
    throw profileError

  const onboarding = profile.onboarding && typeof profile.onboarding === 'object' && !Array.isArray(profile.onboarding)
    ? profile.onboarding
    : {}
  const abtests = onboarding.abtests && typeof onboarding.abtests === 'object' && !Array.isArray(onboarding.abtests)
    ? onboarding.abtests
    : {}
  const { error: updateError } = await adminClient
    .from('users')
    .update({
      onboarding: {
        ...onboarding,
        abtests: {
          ...abtests,
          webnativeapp_publish_intent: {
            assigned_at: new Date().toISOString(),
            branch: 'A',
          },
          webnativeapp_development_environment: {
            assigned_at: new Date().toISOString(),
            branch: 'C',
          },
        },
      },
    })
    .eq('id', sessionData.user.id)
  if (updateError)
    throw updateError

  // End only this helper session; the browser must stay signed in.
  await supabase.auth.signOut({ scope: 'local' })
}

async function expectProtectedRouteRedirect(page: Page, targetPath: string, expectedUrl: RegExp, expectedSelector: string) {
  const redirectedPage = await page.context().newPage()

  try {
    await redirectedPage.goto(targetPath, { waitUntil: 'commit' })
    await redirectedPage.waitForURL(expectedUrl)
    if (new URL(redirectedPage.url()).pathname === '/onboarding/name')
      await continuePastProfileWelcome(redirectedPage)
    await expect(redirectedPage.locator(expectedSelector)).toBeVisible()
  }
  finally {
    await redirectedPage.close()
  }
}

async function continueFromAppNameToIcon(page: Page) {
  await page.click('[data-test="app-onboarding-continue"]')
  await expect(page.locator('[data-test="app-onboarding-toggle-icon-store-import"]')).toBeVisible()
  await expect(page.locator('#app-onboarding-app-id')).toHaveCount(0)
}

async function continueFromAppNameToOrganization(page: Page) {
  await continueFromAppNameToIcon(page)
  await page.click('[data-test="app-onboarding-continue"]')
}

async function returnFromOrganizationToAppName(page: Page) {
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.locator('[data-test="app-onboarding-toggle-icon-store-import"]')).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.locator('[data-test="app-onboarding-name"]')).toBeVisible()
}

test.describe('Registration', () => {
  test.beforeEach(async ({ page }) => {
    await enableNameTreatmentFixture(page)
    await page.goto('/register/')
  })

  test('keeps the name step disabled without a V6 assignment', async ({ page }) => {
    await page.unroute('**/auth/register')
    await page.unroute('**/private/onboarding_ab_tests')
    const email = `v6-disabled-${Date.now()}@example.com`
    await page.fill('[data-test="email"]', email)
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password123!')
    await page.click('[data-test="submit"]')
    await page.waitForURL(/\/onboarding\/app/)
    await expect(page.locator('[data-test="onboarding-name-step"]')).toHaveCount(0)
    const { data: profile, error } = await localAdminClient().from('users').select('onboarding').eq('email', email).single()
    expect(error).toBeNull()
    expect(profile?.onboarding).not.toHaveProperty('abtests.onboarding_v6')
    expect(profile?.onboarding).not.toHaveProperty('version', 6)
  })

  test('returns from Your goal to saved names and retains the selected goal', async ({ page }) => {
    await page.fill('[data-test="email"]', `profile-back-${Date.now()}@example.com`)
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password123!')
    await page.click('[data-test="submit"]')
    await page.waitForURL(/\/onboarding\/name/)
    await continuePastProfileWelcome(page)
    await completeName(page)
    await expectOnboardingGoal(page)
    await page.click('[data-test="onboarding-intent-builder"]')
    await page.click('[data-test="app-onboarding-back-profile"]')
    await expect(page.locator('[data-test="onboarding-first-name"]')).toHaveValue('Example')
    await expect(page.locator('[data-test="onboarding-last-name"]')).toHaveValue('User')
    await expect(page.locator('[data-test="onboarding-welcome"]')).toHaveCount(0)
    await page.fill('[data-test="onboarding-first-name"]', '')
    await expect(page.locator('[data-test="onboarding-name-continue"]')).toBeDisabled()
    await page.fill('[data-test="onboarding-first-name"]', 'Updated')
    await page.click('[data-test="onboarding-name-continue"]')
    await expectOnboardingGoal(page)
    await expect(page.locator('[data-test="onboarding-intent-builder"]')).toHaveClass(/(?:^|\s)border-primary-500(?:\s|$)/)
    await expect(page.locator('[data-test="onboarding-resume-continue"]')).toHaveCount(0)
    await page.click('[data-test="app-onboarding-back-profile"]')
    await expect(page.locator('[data-test="onboarding-first-name"]')).toHaveValue('Updated')
    await expect(page.locator('[data-test="onboarding-last-name"]')).toHaveValue('User')
  })

  test('should redirect new users through app-first onboarding until the org is created', async ({ page }) => {
    const uniqueSuffix = Date.now()
    const email = `no-org-e2e-${uniqueSuffix}@example.com`
    const appName = `No Org App ${uniqueSuffix}`
    const editedAppName = `Renamed App ${uniqueSuffix}`
    const finalAppName = `Final App ${uniqueSuffix}`
    const organizationName = `Manual Org ${uniqueSuffix}`

    await expect(page.locator('[data-test="first_name"]')).toHaveCount(0)
    await expect(page.locator('[data-test="last_name"]')).toHaveCount(0)
    await page.fill('[data-test="email"]', email)
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password123!')
    await page.route('**/auth/v1/signup', route => route.abort())
    const registrationRequest = page.waitForRequest(request => request.url().endsWith('/auth/register') && request.method() === 'POST')
    await page.click('[data-test="submit"]')
    const registrationPayload = (await registrationRequest).postDataJSON()
    expect(registrationPayload).not.toHaveProperty('first_name')
    expect(registrationPayload).not.toHaveProperty('last_name')

    await page.waitForURL(/\/onboarding\/name/)
    await continuePastProfileWelcome(page)
    await expectProtectedRouteRedirect(page, '/dashboard', /\/onboarding\/name/, '[data-test="onboarding-name-step"]')
    await page.route('**/rest/v1/users?*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 503, json: { code: 'unavailable', message: 'Test profile load failure' } })
        return
      }
      await route.fallback()
    })
    await page.reload()
    await expect(page.locator('[data-test="account-load-recovery"]')).toBeVisible()
    await expect(page.locator('[data-test="onboarding-name-step"]')).toHaveCount(0)
    await page.unroute('**/rest/v1/users?*')
    await page.locator('[data-test="account-load-retry"]').click()
    await page.waitForURL(/\/onboarding\/name/)
    await continuePastProfileWelcome(page)
    await expect(page.locator('[data-test="onboarding-name-step"]')).toBeVisible()
    await expect(page.locator('[data-test="onboarding-intent-ota"]')).toHaveCount(0)
    const continueGoal = page.locator('[data-test="onboarding-name-continue"]')
    await expect(continueGoal).toBeDisabled()
    await expect(page.getByRole('heading', { name: 'About you', exact: true })).toBeVisible()
    await expect(page.locator('nav[aria-label="Onboarding progress"] [aria-current="step"]')).toContainText('About you')
    await expect(page.getByText('One command. Live on next launch.', { exact: true })).toHaveCount(0)
    await expect(page.locator('[data-test="onboarding-last-name"]')).toBeVisible()
    await page.fill('[data-test="onboarding-first-name"]', '   ')
    await expect(continueGoal).toBeDisabled()
    await page.fill('[data-test="onboarding-first-name"]', '  Example  ')
    await page.fill('[data-test="onboarding-last-name"]', '   ')
    await expect(continueGoal).toBeDisabled()
    await page.fill('[data-test="onboarding-last-name"]', '  User  ')
    await expect(continueGoal).toBeEnabled()

    await page.route('**/rest/v1/users?*', async (route) => {
      if (route.request().method() === 'PATCH' && route.request().postDataJSON()?.first_name) {
        await route.fulfill({ status: 500, json: { message: 'Test profile save failure' } })
        return
      }
      await route.fallback()
    })
    await continueGoal.click()
    await expect(page.getByText('Error while updating your account', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/onboarding\/name/)
    await expect(page.locator('[data-test="app-onboarding-name"]')).toHaveCount(0)
    await page.unroute('**/rest/v1/users?*')
    await continueGoal.click()
    await expectOnboardingGoal(page)
    await page.click('[data-test="onboarding-intent-ota"]')
    await page.click('[data-test="app-onboarding-continue-intent"]')
    await continuePastDevelopmentEnvironmentIfShown(page)

    const supabase = createClient(localSupabaseUrl, localSupabaseAnonKey)
    const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password: 'Password123!' })
    expect(signInError).toBeNull()
    const { data: profile, error: profileError } = await supabase.from('users')
      .select('first_name, last_name')
      .eq('id', signedIn.user!.id)
      .single()
    expect(profileError).toBeNull()
    expect(profile).toEqual({ first_name: 'Example', last_name: 'User' })
    await supabase.auth.signOut({ scope: 'local' })

    await expect(page.locator('[data-test="app-onboarding-existing-yes"]')).toHaveCount(0)
    await expect(page.locator('[data-test="app-onboarding-existing-no"]')).toHaveCount(0)
    await expect(page.locator('[data-test="app-onboarding-name"]')).toBeVisible()
    await expect(page.locator('#app-onboarding-app-id')).toHaveCount(0)
    const appNameInput = page.locator('[data-test="app-onboarding-name"]')
    const continueButton = page.locator('[data-test="app-onboarding-continue"]')
    await expect(continueButton).toBeVisible()
    await expect(continueButton).toBeDisabled()
    await appNameInput.fill('   ')
    await expect(continueButton).toBeDisabled()
    await appNameInput.fill(appName)
    await expect(continueButton).toBeEnabled()
    await appNameInput.fill('')
    await expect(continueButton).toBeDisabled()
    await appNameInput.fill('   ')
    await expect(continueButton).toBeDisabled()
    await appNameInput.fill(`  ${appName}  `)
    await expect(continueButton).toBeEnabled()
    await continueFromAppNameToOrganization(page)

    await expectProtectedRouteRedirect(page, '/apps', /\/onboarding\/app/, '[data-test="onboarding-logout"]')

    await expect(page.locator('[data-test="onboarding-org-name"]')).toHaveValue(appName)
    await page.locator('[data-test="onboarding-estimated-users-option"]').nth(1).click()
    await returnFromOrganizationToAppName(page)
    await page.fill('[data-test="app-onboarding-name"]', editedAppName)
    await continueFromAppNameToOrganization(page)
    await expect(page.locator('[data-test="onboarding-org-name"]')).toHaveValue(editedAppName)
    await page.fill('[data-test="onboarding-org-name"]', organizationName)
    await returnFromOrganizationToAppName(page)
    await page.fill('[data-test="app-onboarding-name"]', finalAppName)
    await continueFromAppNameToOrganization(page)
    await expect(page.locator('[data-test="onboarding-org-name"]')).toHaveValue(organizationName)
    const createOrganization = page.locator('[data-test="onboarding-create-org"]')
    await expect(createOrganization).toBeEnabled()
    await expect(page.locator('[data-test="onboarding-first-name"]')).toHaveCount(0)
    await expect(page.locator('[data-test="onboarding-last-name"]')).toHaveCount(0)
    await createOrganization.click()

    await expect(page.locator('[data-test="onboarding-invite-users"]')).toBeVisible({ timeout: 60000 })
    await expect(page.locator('[data-test="onboarding-first-name"]')).toHaveCount(0)

    await expect(page.locator('[data-test="app-onboarding-command-copy"]')).toHaveCount(0)
    await page.click('[data-test="onboarding-finish"]')

    await continuePastChannelOnboardingIfShown(page)
    await expect(page.locator('[data-test="onboarding-technical-invite"]')).toBeVisible()
    await expect(page).toHaveURL(/\/app\/[^/]+\/getting-started$/)
  })

  test('should collect first and last names before the goal on the About you step on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.fill('[data-test="email"]', `mobile-profile-e2e-${Date.now()}@example.com`)
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password123!')
    await page.click('[data-test="submit"]')
    await page.waitForURL(/\/onboarding\/name/)
    await continuePastProfileWelcome(page)

    await expect(page.locator('[data-test="onboarding-welcome-continue"]')).toHaveCount(0)
    await expect(page.locator('[data-test="onboarding-first-name"]')).toBeVisible()
    await expect(page.locator('[data-test="onboarding-last-name"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'About you', exact: true })).toBeVisible()
    const nameBox = await page.locator('[data-test="onboarding-first-name"]').boundingBox()
    const surnameBox = await page.locator('[data-test="onboarding-last-name"]').boundingBox()
    expect(nameBox).not.toBeNull()
    expect(surnameBox).not.toBeNull()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.fill('[data-test="onboarding-first-name"]', 'Example')
    await page.fill('[data-test="onboarding-last-name"]', 'User')
    await expect(page.locator('[data-test="onboarding-intent-ota"]')).toHaveCount(0)
    await page.click('[data-test="onboarding-name-continue"]')
    await page.click('[data-test="onboarding-intent-ota"]')
    await page.click('[data-test="app-onboarding-continue-intent"]')
    await continuePastDevelopmentEnvironmentIfShown(page)
    await expect(page.locator('[data-test="app-onboarding-name"]')).toBeVisible()
    await expect(page.locator('[data-test="onboarding-first-name"]')).toHaveCount(0)
  })

  for (const mobile of [false, true]) {
    test(`should restore name drafts after refresh before selecting a goal on ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
      if (mobile)
        await page.setViewportSize({ width: 390, height: 844 })
      const email = `draft-profile-e2e-${Date.now()}-${mobile}@example.com`
      const password = 'Password123!'
      await page.fill('[data-test="email"]', email)
      await page.fill('[data-test="password"]', password)
      await page.fill('[data-test="confirm-password"]', password)
      await page.click('[data-test="submit"]')
      await page.waitForURL(/\/onboarding\/name/)
      await continuePastProfileWelcome(page)

      const draftSaved = page.waitForResponse((response) => {
        if (!response.url().includes('/rest/v1/users?') || response.request().method() !== 'PATCH' || !response.ok())
          return false
        const draft = response.request().postDataJSON()?.onboarding?.profile_draft
        return draft?.first_name === 'Draft' && draft?.last_name === 'User'
      })
      await page.fill('[data-test="onboarding-first-name"]', 'Draft')
      await page.fill('[data-test="onboarding-last-name"]', 'User')
      await draftSaved

      const supabase = createClient(localSupabaseUrl, localSupabaseAnonKey)
      const { data: session, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      expect(signInError).toBeNull()
      const { data: profile, error } = await supabase.from('users')
        .select('first_name, last_name, onboarding')
        .eq('id', session.user!.id)
        .single()
      expect(error).toBeNull()
      expect(profile?.first_name || '').toBe('')
      expect(profile?.last_name || '').toBe('')
      expect(profile?.onboarding).toMatchObject({ abtests: { onboarding_v6: { branch: 'A', assigned_at: '2026-10-19T11:00:00.000Z' } }, profile_draft: { first_name: 'Draft', last_name: 'User' } })
      await supabase.auth.signOut({ scope: 'local' })

      await page.reload()
      const firstName = page.locator('[data-test="onboarding-first-name"]')
      await expect(page.locator('[data-test="onboarding-resume-continue"]')).toBeVisible()
      await expect(firstName).toHaveCount(0)
      await page.click('[data-test="onboarding-resume-continue"]')
      await expect(page.locator('[data-test="onboarding-welcome-continue"]')).toHaveCount(0)
      await expect(firstName).toHaveValue('Draft')
      await expect(page.locator('[data-test="onboarding-last-name"]')).toHaveValue('User')
      await expect(page.locator('[data-test="onboarding-name-continue"]')).toBeEnabled()

      await page.reload()
      await expect(page.locator('[data-test="onboarding-resume-restart"]')).toBeVisible()
      await page.click('[data-test="onboarding-resume-restart"]')
      await expect(page.locator('[data-test="onboarding-welcome-continue"]')).toBeVisible()
      await continuePastProfileWelcome(page)
      await expect(firstName).toHaveValue('')
      await expect(page.locator('[data-test="onboarding-last-name"]')).toHaveValue('')
      await expect(page.locator('[data-test="onboarding-name-continue"]')).toBeDisabled()
      await firstName.fill('Draft')
      await page.fill('[data-test="onboarding-last-name"]', 'User')
      await page.click('[data-test="onboarding-name-continue"]')
      if (!mobile)
        await expectOnboardingGoal(page)
      await page.click('[data-test="onboarding-intent-ota"]')
      await page.click('[data-test="app-onboarding-continue-intent"]')
      await continuePastDevelopmentEnvironmentIfShown(page)
      await expect(page.locator('[data-test="app-onboarding-name"]')).toBeVisible()
    })
  }

  test('should save an incomplete profile before creating a standalone organization', async ({ page }) => {
    const email = `standalone-profile-e2e-${Date.now()}@example.com`
    const password = 'Password123!'
    const supabase = createClient(localSupabaseUrl, localSupabaseAnonKey)
    const { data: signedUp, error: signUpError } = await supabase.auth.signUp({ email, password })
    expect(signUpError).toBeNull()
    const { error: updateError } = await localAdminClient().from('users').upsert({ id: signedUp.user!.id, email, first_name: 'Example', last_name: '', onboarding: { abtests: { onboarding_v6: { branch: 'A', assigned_at: '2026-10-19T11:00:00.000Z' } }, version: 6 } }, { onConflict: 'id' })
    expect(updateError).toBeNull()
    await seedNameTreatment(signedUp.user!.id)
    await supabase.auth.signOut({ scope: 'local' })

    await loginToOnboarding(page, email, password)
    await page.goto('/onboarding/organization?source=org-switcher')
    await continuePastProfileWelcome(page)
    await expect(page.locator('[data-test="onboarding-first-name"]')).toHaveValue('Example')
    await expect(page.locator('[data-test="onboarding-last-name"]')).toHaveValue('')
    await expect(page).toHaveURL(/\/onboarding\/name/)
    const createOrganization = page.locator('[data-test="onboarding-name-continue"]')
    await expect(createOrganization).toBeDisabled()
    await page.fill('[data-test="onboarding-last-name"]', '   ')
    await expect(createOrganization).toBeDisabled()
    await page.fill('[data-test="onboarding-last-name"]', '  User  ')
    await expect(createOrganization).toBeEnabled()

    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().includes('/rest/v1/users?') && request.postDataJSON()?.last_name === 'User')
        writes.push('profile')
      if (request.method() === 'POST' && /\/organization(?:\?|$)/.test(request.url()))
        writes.push('organization')
    })
    await createOrganization.click()
    await page.click('[data-test="onboarding-intent-ota"]')
    await page.click('[data-test="onboarding-mode-name"]')
    await page.fill('[data-test="onboarding-org-name"]', `Standalone Profile Org ${Date.now()}`)
    await page.locator('[data-test="onboarding-estimated-users-option"]').first().click()
    await page.click('[data-test="onboarding-create-org"]')
    await expect(page.locator('[data-test="onboarding-logo-action"]')).toBeVisible({ timeout: 60000 })
    expect(writes).toEqual(['profile', 'organization'])

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    expect(signInError).toBeNull()
    const { data: profile, error: profileError } = await supabase.from('users')
      .select('first_name, last_name')
      .eq('id', signedUp.user!.id)
      .single()
    expect(profileError).toBeNull()
    expect(profile).toEqual({ first_name: 'Example', last_name: 'User' })
    await supabase.auth.signOut({ scope: 'local' })
  })

  test('should complete a partial profile and skip both names for subsequent organizations', async ({ page }) => {
    const email = `partial-profile-e2e-${Date.now()}@example.com`
    const password = 'Password123!'
    const supabase = createClient(localSupabaseUrl, localSupabaseAnonKey)
    const { data: signedUp, error: signUpError } = await supabase.auth.signUp({ email, password })
    expect(signUpError).toBeNull()
    const { data: seededProfile, error: updateError } = await localAdminClient().from('users').upsert({ id: signedUp.user!.id, email, first_name: 'Example', last_name: '', onboarding: { abtests: { onboarding_v6: { branch: 'A', assigned_at: '2026-10-19T11:00:00.000Z' } }, version: 6 } }, { onConflict: 'id' }).select('first_name, last_name').single()
    expect(updateError).toBeNull()
    expect(seededProfile).toEqual({ first_name: 'Example', last_name: '' })
    await seedNameTreatment(signedUp.user!.id)
    await supabase.auth.signOut({ scope: 'local' })

    await loginToOnboarding(page, email, password)
    await expect(page.locator('[data-test="onboarding-first-name"]')).toHaveValue('Example')
    await expect(page.locator('[data-test="onboarding-last-name"]')).toHaveValue('')
    await expect(page.locator('[data-test="onboarding-name-continue"]')).toBeDisabled()
    await page.fill('[data-test="onboarding-last-name"]', '  User  ')
    await expect(page.locator('[data-test="onboarding-name-continue"]')).toBeEnabled()
    await page.click('[data-test="onboarding-name-continue"]')
    await expectOnboardingGoal(page)
    await page.click('[data-test="onboarding-intent-ota"]')
    await page.click('[data-test="app-onboarding-continue-intent"]')
    await continuePastDevelopmentEnvironmentIfShown(page)

    await page.goto('/onboarding/organization?source=org-switcher')
    await page.click('[data-test="onboarding-intent-ota"]')
    await page.click('[data-test="onboarding-mode-name"]')
    await expect(page.locator('[data-test="onboarding-first-name"]')).toHaveCount(0)
    await expect(page.locator('[data-test="onboarding-last-name"]')).toHaveCount(0)
    await page.fill('[data-test="onboarding-org-name"]', `Profile Org ${Date.now()}`)
    await page.locator('[data-test="onboarding-estimated-users-option"]').first().click()
    const createOrganization = page.locator('[data-test="onboarding-create-org"]')
    await expect(createOrganization).toBeEnabled()
    await createOrganization.click()
    await expect(page.locator('[data-test="onboarding-logo-action"]')).toBeVisible({ timeout: 60000 })

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    expect(signInError).toBeNull()
    const { data: profile, error: profileError } = await supabase.from('users')
      .select('first_name, last_name')
      .eq('id', signedUp.user!.id)
      .single()
    expect(profileError).toBeNull()
    expect(profile).toEqual({ first_name: 'Example', last_name: 'User' })
    await supabase.auth.signOut({ scope: 'local' })

    await page.goto('/onboarding/organization?source=org-switcher')
    await page.click('[data-test="onboarding-intent-ota"]')
    await page.click('[data-test="onboarding-mode-name"]')
    await expect(page.locator('[data-test="onboarding-first-name"]')).toHaveCount(0)
    await expect(page.locator('[data-test="onboarding-last-name"]')).toHaveCount(0)
  })

  test('should preserve an existing surname when saving the first name', async ({ page }) => {
    const email = `surname-profile-e2e-${Date.now()}@example.com`
    const password = 'Password123!'
    const supabase = createClient(localSupabaseUrl, localSupabaseAnonKey)
    const { data: signedUp, error: signUpError } = await supabase.auth.signUp({ email, password })
    expect(signUpError).toBeNull()
    const { error: updateError } = await localAdminClient().from('users').upsert({ id: signedUp.user!.id, email, first_name: '', last_name: 'Existing', onboarding: { abtests: { onboarding_v6: { branch: 'A', assigned_at: '2026-10-19T11:00:00.000Z' } }, version: 6 } }, { onConflict: 'id' })
    expect(updateError).toBeNull()
    await seedNameTreatment(signedUp.user!.id)
    await supabase.auth.signOut({ scope: 'local' })

    await loginToOnboarding(page, email, password)
    await expect(page.locator('[data-test="onboarding-last-name"]')).toHaveValue('Existing')
    await page.fill('[data-test="onboarding-first-name"]', '  Example  ')
    await page.click('[data-test="onboarding-name-continue"]')
    await expectOnboardingGoal(page)
    await page.click('[data-test="onboarding-intent-ota"]')
    await page.click('[data-test="app-onboarding-continue-intent"]')
    await continuePastDevelopmentEnvironmentIfShown(page)
    await expect(page.locator('[data-test="app-onboarding-name"]')).toBeVisible()

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    expect(signInError).toBeNull()
    const { data: profile, error: profileError } = await supabase.from('users')
      .select('first_name, last_name')
      .eq('id', signedUp.user!.id)
      .single()
    expect(profileError).toBeNull()
    expect(profile).toEqual({ first_name: 'Example', last_name: 'Existing' })
    await supabase.auth.signOut({ scope: 'local' })
  })

  test('should offer to continue or restart onboarding after a dropout', async ({ page }) => {
    const uniqueSuffix = Date.now()
    const email = `onboarding-resume-e2e-${uniqueSuffix}@example.com`
    const appName = `Resume App ${uniqueSuffix}`
    const password = 'Password123!'

    await page.fill('[data-test="email"]', email)
    await page.fill('[data-test="password"]', password)
    await page.fill('[data-test="confirm-password"]', password)
    await page.click('[data-test="submit"]')

    await page.waitForURL(/\/onboarding\/name/)
    await continuePastProfileWelcome(page)
    await completeName(page)
    await expectOnboardingGoal(page)
    await page.click('[data-test="onboarding-intent-ota"]')
    await page.click('[data-test="app-onboarding-continue-intent"]')
    await continuePastDevelopmentEnvironmentIfShown(page)
    await page.fill('[data-test="app-onboarding-name"]', appName)
    await continueFromAppNameToIcon(page)
    await Promise.all([
      page.waitForResponse((response) => {
        if (!response.url().includes('/rest/v1/users') || response.request().method() !== 'PATCH' || !response.ok())
          return false
        return (response.request().postData() ?? '').includes('"step":"organization"')
      }),
      page.click('[data-test="app-onboarding-continue"]'),
    ])
    await expect(page.locator('[data-test="onboarding-org-name"]')).toHaveValue(appName)

    await page.click('[data-test="onboarding-logout"]')
    await page.waitForURL(/\/login\/?$/)
    await loginToOnboarding(page, email, password)

    await expect(page.locator('[data-test="onboarding-resume-continue"]')).toBeVisible()
    await page.locator('[data-test="onboarding-resume-continue"]').click()
    await expect(page.locator('[data-test="onboarding-org-name"]')).toHaveValue(appName)

    await page.click('[data-test="onboarding-logout"]')
    await page.waitForURL(/\/login\/?$/)
    await loginToOnboarding(page, email, password)
    await expect(page.locator('[data-test="onboarding-resume-restart"]')).toBeVisible()
    await page.locator('[data-test="onboarding-resume-restart"]').click()
    await continuePastProfileWelcome(page)
    await page.locator('[data-test="onboarding-name-continue"]').click()
    await expectOnboardingGoal(page)
    await expect(page.locator('[data-test="onboarding-intent-ota"]')).toBeVisible()
    await expect(page.locator('[data-test="onboarding-first-name"]')).toHaveCount(0)
    await expect(page.locator('[data-test="onboarding-last-name"]')).toHaveCount(0)
    await expect(page.locator('[data-test="onboarding-org-name"]')).toHaveCount(0)
  })

  test('should recommend WebNativeApp to treatment users publishing without existing users', async ({ page }) => {
    const uniqueSuffix = Date.now()
    const email = `webnative-treatment-e2e-${uniqueSuffix}@example.com`
    const password = 'Password123!'
    const appName = `WebNative Treatment ${uniqueSuffix}`

    await page.fill('[data-test="email"]', email)
    await page.fill('[data-test="password"]', password)
    await page.fill('[data-test="confirm-password"]', password)
    await page.click('[data-test="submit"]')

    await page.waitForURL(/\/onboarding\/name/)
    await continuePastProfileWelcome(page)
    await completeName(page)
    await expectOnboardingGoal(page)
    await forceWebNativeOnboardingTreatments(email, password)
    await page.reload()
    await expect(page.locator('[data-test="onboarding-resume-continue"]')).toBeVisible()
    await page.locator('[data-test="onboarding-resume-continue"]').click()

    await expect(page.locator('[data-test="onboarding-intent-publish"]')).toBeVisible()
    await expect(page.locator('[data-test="onboarding-development-environment-hosted_builder"]')).toHaveCount(0)
    await page.click('[data-test="onboarding-intent-publish"]')
    await page.click('[data-test="app-onboarding-continue-intent"]')
    await expect(page.locator('[data-test="onboarding-development-environment-hosted_builder"]')).toBeVisible()
    await expect(page.locator('[data-test="onboarding-intent-publish"]')).toHaveCount(0)
    await expect(page.locator('[data-test="app-onboarding-skip-development-environment"]')).toBeVisible()
    await expect(page.locator('[data-test="app-onboarding-continue-development-environment"]')).toHaveCount(0)
    await page.click('[data-test="onboarding-development-environment-hosted_builder"]')
    await expect(page.locator('[data-test="app-onboarding-continue-development-environment"]')).toBeVisible()
    await page.click('[data-test="app-onboarding-continue-development-environment"]')
    await page.fill('[data-test="app-onboarding-name"]', appName)
    await continueFromAppNameToOrganization(page)

    await page.locator('[data-test="onboarding-starting-out"]').click()
    await expect(page.locator('[data-test="onboarding-webnative-recommendation"]')).toBeVisible()
    await expect(page.locator('[data-test="onboarding-webnative-check-website"]')).toHaveAttribute('href', 'https://webnativeapp.com/?ref=capgo')
    await expect(page.locator('[data-test="onboarding-create-org"]')).toHaveCount(0)

    await page.click('[data-test="onboarding-webnative-continue-capgo"]')
    await expect(page.locator('[data-test="onboarding-webnative-recommendation"]')).toHaveCount(0)
    await expect(page.locator('[data-test="onboarding-create-org"]')).toBeEnabled()
  })

  test('should allow new users to log out from org onboarding', async ({ page }) => {
    const uniqueSuffix = Date.now()
    const email = `no-org-logout-e2e-${uniqueSuffix}@example.com`

    await page.fill('[data-test="email"]', email)
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password123!')
    await page.click('[data-test="submit"]')

    await page.waitForURL(/\/onboarding\/name/)
    await continuePastProfileWelcome(page)
    await completeName(page)
    await page.click('[data-test="onboarding-logout"]')

    await page.waitForURL(/\/login\/?$/)
    await expectProtectedRouteRedirect(page, '/apps', /\/login/, '[data-test="email"]')
  })

  test('should show error for existing email', async ({ page }) => {
    await page.fill('[data-test="email"]', 'test@capgo.app')
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password123!')
    await page.click('[data-test="submit"]')
    await expect(page.locator('[data-test="form-error"]')).toContainText('User already registered')
  })

  test('should show error for deleted account email', async ({ page }) => {
    await page.fill('[data-test="email"]', 'deleted@capgo.app')
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password123!')
    await page.click('[data-test="submit"]')
    await expect(page.locator('[data-test="form-error"]')).toContainText('Account with this email used to exist, cannot recreate')
  })

  test('should show error for password mismatch', async ({ page }) => {
    await page.fill('[data-test="email"]', 'new@example.com')
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password456!')
    await page.click('[data-test="submit"]')
    await expect(page.locator('.formkit-messages [data-message-type="validation"]')).toContainText('Password confirmation does not match')
  })

  test('should require a number before submitting to the registration API', async ({ page }) => {
    let requests = 0
    page.on('request', (request) => {
      if (request.url().endsWith('/auth/register') && request.method() === 'POST')
        requests++
    })
    await page.fill('[data-test="email"]', 'password-policy@example.com')
    await page.fill('[data-test="password"]', 'Password!')
    await page.fill('[data-test="confirm-password"]', 'Password!')
    await page.click('[data-test="submit"]')
    await expect(page.locator('.formkit-messages [data-message-type="validation"]')).toContainText(/number/i)
    expect(requests).toBe(0)
    await expect(page).toHaveURL(/\/register\/?$/)
  })
})
