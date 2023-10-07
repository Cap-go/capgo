import { expect, test as setup } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'
const authFile1 = 'playwright/.auth/user1.json'
// const authFile2 = 'playwright/.auth/user2.json'

setup('authenticate as test1', async ({ page }) => {
  await page.goto(`${BASE_URL}/`)

  // Fill in the username and password fields
  await page.fill('input[name="email"]', 'test@capgo.app')
  await page.fill('input[name="password"]', 'testtest')

  // Click the submit button
  await page.getByRole('button', { name: 'Log in' }).click()

  // Expect the URL to change to the logged in dashboard
  await expect(page).toHaveURL(`${BASE_URL}/app/home`, { timeout: 60_000 })

  await page.context().storageState({ path: authFile1 })
})

// This will be usefull some day
// setup('authenticate as test2', async ({ page }) => {
//   await page.goto(`${BASE_URL}/login`)

//   // Fill in the username and password fields
//   await page.fill('input[name="email"]', 'test2@capgo.app')
//   await page.fill('input[name="password"]', 'testtest')

//   // Click the submit button
//   await page.getByRole('button', { name: 'Log in' }).click()

//   // Expect the URL to change to the logged in dashboard
//   await expect(page).toHaveURL(`${BASE_URL}/app/home`, { timeout: 60_000 })

//   await page.context().storageState({ path: authFile2 })
// })
