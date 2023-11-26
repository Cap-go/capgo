import { expect, test as setup } from '@playwright/test'
import { existsSync } from 'node:fs';

const BASE_URL = 'http://localhost:5173'
const authFile1 = 'playwright/.auth/user1.json'
const authFile2 = 'playwright/.auth/user2.json'

setup.describe.configure({ mode: 'serial' })

setup('authenticate as test1', async ({ page }) => {
  await page.goto(`${BASE_URL}/`)
  
  if (existsSync(authFile2))
    return

  const email = 'test@capgo.app'

  // Fill in the username and password fields
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', 'testtest')

  // Click the submit button
  await page.getByRole('button', { name: 'Log in' }).click()

  // Expect the URL to change to the logged in dashboard
  await expect(page).toHaveURL(`${BASE_URL}/app/home`, { timeout: 60_000 })

  await page.evaluate(email => localStorage.setItem('supabase-email', email), email)
  await page.context().storageState({ path: authFile1 })
})

setup('authenticate as test2', async ({ page }) => {
  await page.goto(`${BASE_URL}/`)

  if (existsSync(authFile2))
    return

  const email = 'test2@capgo.app'

  // Fill in the username and password fields
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', 'testtest')

  // Click the submit button
  await page.getByRole('button', { name: 'Log in' }).click()

  // Expect the URL to change to the logged in dashboard
  await expect(page).toHaveURL(`${BASE_URL}/app/home`, { timeout: 60_000 })

  await page.evaluate(email => localStorage.setItem('supabase-email', email), email)
  await page.context().storageState({ path: authFile2 })
})
