import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const fixture = '/playwright/fixtures/onboarding-setup.html?view=builder'

async function openBuilderTask(page: Page, id: string) {
  const toggle = page.locator('[data-test="builder-checklist-toggle"]')
  if (await toggle.getAttribute('aria-expanded') === 'false')
    await toggle.click()
  await page.locator(`[data-test="builder-step-${id}"] button`).click()
}

test('shows live Builder progress while keeping platform tasks separate', async ({ page }) => {
  await page.clock.install()
  await page.goto(fixture)
  await expect(page.getByRole('heading', { name: 'Build your first native app' })).toBeVisible()
  await expect(page.locator('[data-test="builder-checklist-choose-platform"]')).toBeVisible()

  await page.locator('[data-test="builder-platform-ios"]').click()
  await expect(page.locator('[data-test^="builder-step-"] button')).toContainText([
    'Start guided Builder setup',
    'Choose where the build goes',
    'Connect App Store Connect',
    'Prepare a distribution certificate',
    'Prepare a provisioning profile',
    'Run a successful cloud build',
  ])
  await expect(page.locator('[data-test^="builder-step-"]')).toHaveCount(6)
  await expect(page.locator('[data-test="builder-checklist-progress"]')).toHaveText('0 of 6 complete')
  await expect(page.locator('[data-test="builder-step-start_setup"]')).toContainText('Current task')
  await expect(page.locator('[data-test="builder-checklist-command"]')).toHaveText('npx @capgo/cli@latest build init -a [API_KEY] --platform ios')
  await openBuilderTask(page, 'prepare_certificate')
  await expect(page.locator('[data-test="builder-checklist-instructions"]')).toContainText('Import an existing Apple distribution certificate')
  await expect(page.locator('[data-test="builder-checklist-instructions"]')).toContainText('Not started')

  await page.evaluate(() => {
    (window as any).onboardingSetupPreview.state.builderSteps.ios.start_setup = { status: 'done' }
  })
  await page.clock.runFor(5000)
  await expect(page.locator('[data-test="builder-checklist-progress"]')).toHaveText('1 of 6 complete')
  await expect(page.locator('[data-test="builder-step-start_setup"]')).toHaveAttribute('data-status', 'done')
  await expect(page.locator('[data-test="builder-checklist-instructions"]')).toContainText('Import an existing Apple distribution certificate')

  await page.locator('[data-test="builder-platform-android"]').click()
  await expect(page.locator('[data-test^="builder-step-"] button')).toContainText([
    'Start guided Builder setup',
    'Prepare your signing keystore',
    'Connect Google Play',
    'Run a successful cloud build',
  ])
  await expect(page.locator('[data-test^="builder-step-"]')).toHaveCount(4)
  await expect(page.locator('[data-test="builder-step-choose_destination"]')).toHaveCount(0)
  await expect(page.locator('[data-test="builder-step-prepare_certificate"]')).toHaveCount(0)
  await expect(page.locator('[data-test="builder-checklist-command"]')).toHaveText('npx @capgo/cli@latest build init -a [API_KEY] --platform android')
  await expect(page.locator('[data-test="builder-checklist-progress"]')).toHaveText('0 of 4 complete')
  await page.locator('[data-test="builder-checklist-command"]').click()
  await expect.poll(() => page.evaluate(() => (window as any).onboardingSetupPreview.events)).toContain('copy-builder-android')

  await page.locator('[data-test="builder-platform-ios"]').click()
  await expect(page.locator('[data-test="builder-step-start_setup"]')).toHaveAttribute('data-status', 'done')
  await expect(page.locator('[data-test="builder-step-choose_destination"]')).toContainText('Current task')
  expect(await page.evaluate(() => (window as any).onboardingSetupPreview.state.appWrites)).toEqual([])
})

test('requires a successful cloud build before showing completion', async ({ page }) => {
  await page.clock.install()
  await page.goto(`${fixture}&platform=android`)
  await expect(page.locator('[data-test="builder-platform-android"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-test="builder-checklist-progress"]')).toHaveText('0 of 4 complete')

  await page.evaluate(() => {
    (window as any).onboardingSetupPreview.state.builderSteps.android = {
      start_setup: { status: 'done' },
      prepare_keystore: { status: 'done' },
      connect_google_play: { status: 'skipped' },
      successful_cloud_build: { status: 'pending' },
    }
  })
  await page.clock.runFor(5000)
  await expect(page.locator('[data-test="builder-checklist-progress"]')).toHaveText('3 of 4 complete')
  await expect(page.getByRole('heading', { name: 'Your first cloud build succeeded' })).toHaveCount(0)

  await page.evaluate(() => {
    (window as any).onboardingSetupPreview.state.builderSteps.android.successful_cloud_build = { status: 'done' }
  })
  await page.clock.runFor(5000)
  await expect(page.locator('[data-test="builder-checklist-progress"]')).toHaveText('4 of 4 complete')
  await expect(page.getByRole('heading', { name: 'Your first cloud build succeeded' })).toBeVisible()
  await page.getByRole('button', { name: 'Open your app' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).onboardingSetupPreview.events)).toContain('complete')
  expect(await page.evaluate(() => (window as any).onboardingSetupPreview.state.appWrites)).toEqual([])
})

for (const { assignment, checklist } of [
  { assignment: 'builder-only', checklist: 'builder' },
  { assignment: 'ota-only', checklist: 'ota' },
] as const) {
  test(`routes ${assignment} onboarding to the ${checklist} checklist`, async ({ page }) => {
    await page.goto(`/playwright/fixtures/onboarding-setup.html?view=flow&assignment=${assignment}&platform=ios&resume=com.example.onboarding-preview&step=setup`)
    if (checklist === 'builder') {
      await expect(page.locator('[data-test="builder-checklist"]')).toBeVisible()
      await expect(page.locator('[data-test="onboarding-setup-cli"]')).toHaveCount(0)
    }
    else {
      await expect(page.locator('[data-test="onboarding-setup-cli"]')).toBeVisible()
      await expect(page.locator('[data-test="builder-checklist"]')).toHaveCount(0)
    }
  })
}

for (const assignment of ['both-builder', 'both-ota']) {
  test(`asks for a goal for ${assignment} without meaningful progress`, async ({ page }) => {
    await page.goto(`/playwright/fixtures/onboarding-setup.html?view=flow&assignment=${assignment}&platform=ios&resume=com.example.onboarding-preview&step=setup`)
    await expect(page.locator('[data-test="setup-goal-chooser"]')).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(0)
  })
}

test('asks to finish or explicitly skip a Builder step passed over by out-of-order setup', async ({ page }) => {
  await page.clock.install()
  await page.goto(`${fixture}&platform=android`)
  await expect(page.locator('[data-test="builder-checklist-toggle"]')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[data-test="setup-checklist-missed"]')).toHaveCount(0)

  await page.evaluate(() => {
    (window as any).onboardingSetupPreview.state.builderSteps.android.prepare_keystore = { status: 'done' }
  })
  await page.clock.runFor(5000)
  const missed = page.locator('[data-test="setup-checklist-missed"]')
  await expect(missed).toContainText('Steps passed over: 1')
  await expect(missed.locator('[data-test="setup-checklist-missed-start_setup"]')).toHaveText('1. Start guided Builder setup')
  await expect(page.locator('[data-test="builder-checklist-instructions"]')).toContainText('Passed over · 1 of 4')

  await page.locator('[data-test="builder-checklist-skip-step"]').click()
  await page.locator('[data-test="builder-checklist-skip-reason"]').fill('Keystore came from our old CI')
  await page.locator('[data-test="builder-checklist-skip-confirm"]').click()
  await expect.poll(() => page.evaluate(() => (window as any).onboardingSetupPreview.state.skips)).toEqual(['builder.android.start_setup'])
  expect(await page.evaluate(() => (window as any).onboardingSetupPreview.state.skipReasons)).toEqual(['Keystore came from our old CI'])
  await expect(missed).toBeHidden()
  await expect(page.locator('[data-test="builder-checklist-instructions"]')).toContainText('Current task · 3 of 4')
  await expect(page.locator('[data-test="builder-step-start_setup"]')).toHaveAttribute('data-status', 'skipped')
})
