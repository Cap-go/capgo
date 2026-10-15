import { expect, test } from '@playwright/test'

test('web startup strips an unrecognized Google callback before showing login', async ({ page }) => {
  let exchanged = false
  await page.route('**/auth/google/exchange', async (route) => {
    exchanged = true
    await route.fulfill({ status: 400, json: { error: 'invalid_exchange' } })
  })
  await page.goto(`/login#google_code=${'c'.repeat(43)}&state=foreign`)
  await expect(page.locator('[data-test="login-form"]')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  expect(exchanged).toBe(false)
})

test('web callback exchanges the retained verifier without keeping callback credentials in storage', async ({ page }) => {
  const state = 's'.repeat(43)
  const code = 'c'.repeat(43)
  const verifier = 'v'.repeat(43)
  await page.addInitScript(({ state, verifier }) => {
    sessionStorage.setItem('capgo.google-oauth.v1', JSON.stringify({ state, verifier, created: Date.now() }))
  }, { state, verifier })
  let exchanged: unknown
  await page.route('**/auth/google/exchange', async (route) => {
    exchanged = route.request().postDataJSON()
    await route.fulfill({ status: 403, json: { error: 'sso_required' } })
  })
  await page.goto(`/login#google_code=${code}&state=${state}`)
  await expect.poll(() => exchanged).toEqual({ code, code_verifier: verifier })
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('[data-test="login-form"]')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('capgo.google-oauth.v1'))).toBeNull()
})

test('web login never offers Google even when the server enables native Google login', async ({ page }) => {
  await page.route('**/private/config', route => route.fulfill({ json: { nativeGoogleLoginEnabled: true } }))
  await page.goto('/login/')
  await expect(page.locator('[data-test="login-form"]')).toBeVisible()
  await expect(page.locator('[data-test="google-sign-in"]')).toHaveCount(0)
  await expect(page.locator('[data-test="email"]')).toBeVisible()
  await page.route('**/private/sso/check-domain', route => route.fulfill({ json: { has_sso: false } }))
  await page.locator('[data-test="email"]').fill('preview@example.com')
  await expect(page.locator('[data-password-ready="true"]')).toBeVisible()
  await expect(page.locator('[data-test="password"]')).toBeVisible()
})
