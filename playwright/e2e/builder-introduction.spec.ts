import { expect, test } from '@playwright/test'

const fixture = '/playwright/fixtures/onboarding-setup.html?view=builder-intro&otaProgress=1&checklistState=dismissed'

test.use({ reducedMotion: 'reduce' })

test('adds Builder only on the final click and opens Builder over existing OTA progress', async ({ page }) => {
  await page.goto(fixture)
  await expect(page.locator('[data-test="builder-introduction"]')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  for (let slide = 0; slide < 4; slide++) {
    await page.locator('.bp-next').click()
    await expect(page.locator('.bp-dot').nth(slide + 1)).toHaveClass('bp-dot on')
    await expect(page.locator('.bp-slide.show')).toHaveCount(1)
  }
  const cta = page.getByRole('button', { name: 'Start my first build', exact: true })
  await expect(cta).toBeVisible()
  expect(await page.evaluate(() => (window as any).onboardingSetupPreview.state.builderActivationRequests)).toEqual([])
  await page.evaluate(() => (window as any).onboardingSetupPreview.state.builderActivationDelayMs = 300)
  await cta.click()
  await expect(cta).toBeDisabled()
  await expect(page).toHaveURL(/\/app\/com.example.onboarding-preview\/getting-started\?path=builder$/)
  await expect(page.getByRole('tab', { name: 'Builder', exact: true })).toHaveAttribute('aria-selected', 'true')
  expect(await page.evaluate(() => (window as any).onboardingSetupPreview.state.builderActivationRequests)).toEqual([{ method: 'POST', appId: 'com.example.onboarding-preview' }])
  await page.getByRole('tab', { name: 'Live Updates', exact: true }).click()
  await expect(page.locator('[data-test="app-onboarding-cli-step-login_cli_mcp"]')).toHaveAttribute('data-status', 'done')
})

test('keeps the presentation open and allows retry when activation fails', async ({ page }) => {
  await page.goto(fixture)
  await page.evaluate(() => (window as any).onboardingSetupPreview.state.builderActivationError = true)
  for (let slide = 0; slide < 4; slide++) {
    await page.locator('.bp-next').click()
    await expect(page.locator('.bp-dot').nth(slide + 1)).toHaveClass('bp-dot on')
    await expect(page.locator('.bp-slide.show')).toHaveCount(1)
  }
  const cta = page.getByRole('button', { name: 'Start my first build', exact: true })
  await cta.click()
  await expect(page.getByRole('alert')).toContainText('Could not start Builder setup')
  await expect(cta).toBeEnabled()
  await expect(page).toHaveURL(/view=builder-intro/)
  await page.evaluate(() => (window as any).onboardingSetupPreview.state.builderActivationError = false)
  await cta.click()
  await expect(page.getByRole('tab', { name: 'Builder', exact: true })).toHaveAttribute('aria-selected', 'true')
})
