import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { Database } from '~/types/supabase.types'

const DEFAULT_PASSWORD = 'testtest'
const START_TIMEOUT = 3000

export const BASE_URL = 'http://localhost:5173'

const defaultSupabaseUrl = 'http://localhost:54321'
const defaultSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const defaultSupabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let supaClientAdmin: SupabaseClient<Database> = null as any

export type SupabaseType = SupabaseClient<Database>

export async function beforeEachTest({ page }: { page: Page }) {
  // Allow the router to load
  await page.goto(`${BASE_URL}/`)
  await page.waitForTimeout(START_TIMEOUT)
}
async function loginWithEmail({ page }: { page: Page }, email: string) {
  await page.goto(`${BASE_URL}/`)

  // Fill in the username and password fields
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', 'testtest')

  // Click the submit button
  await page.getByRole('button', { name: 'Log in' }).click()

  // Expect the URL to change to the logged in dashboard
  await expect(page).toHaveURL(`${BASE_URL}/app/home`, { timeout: 60_000 })

  await page.evaluate(email => localStorage.setItem('supabase-email', email), email)
}

export async function loginAsUser1({ page }: { page: Page }) {
  await loginWithEmail({ page }, 'test@capgo.app')
}

export async function loginAsUser2({ page }: { page: Page }) {
  await loginWithEmail({ page }, 'test2@capgo.app')
}

export async function expectPopout(page: Page, toHave: string) {
  // Check if the popout has the correct text
  const popOutLocator = '.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)'
  await expect(page.locator(popOutLocator)).toContainText(toHave)

  const a = '.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > button:nth-child(1)'
  if (await page.locator(a).isVisible()) {
    await page.click('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > button:nth-child(1)')
    await expect(page.locator(popOutLocator)).toBeHidden()
  }
}

export async function useSupabase(page: Page) {
  const options: SupabaseClientOptions<'public'> = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }

  // eslint-disable-next-line n/prefer-global/process
  const supaClient = createClient<Database>(process.env.SUPABASE_URL ?? defaultSupabaseUrl, process.env.SUPABASE_ANON ?? defaultSupabaseAnonKey, options)

  const supabaseEmail = await page.evaluate(() => localStorage.getItem('supabase-email'))
  await expect(supabaseEmail).toBeTruthy()

  const { error } = await supaClient.auth.signInWithPassword({
    email: supabaseEmail!,
    password: DEFAULT_PASSWORD,
  })

  expect(error).toBeNull()

  return supaClient
}

// eslint-disable-next-line n/prefer-global/process
export const SUPABASE_URL = process.env.SUPABASE_URL ?? defaultSupabaseUrl
export const ANON_KEY = process.env.SUPABASE_ANON ?? defaultSupabaseAnonKey

export async function useSupabaseAdmin() {
  const options: SupabaseClientOptions<'public'> = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }

  if (supaClientAdmin)
    return supaClientAdmin
  // eslint-disable-next-line n/prefer-global/process
  supaClientAdmin = createClient<Database>(process.env.SUPABASE_URL ?? defaultSupabaseUrl, process.env.SUPABASE_SERVICE ?? defaultSupabaseServiceKey, options)

  return supaClientAdmin
}

type Predicate<T> = (item: T, index: number, items: T[]) => Promise<boolean>

export async function firstItemAsync<T>(array: T[], predicate: Predicate<T>): Promise<T | undefined> {
  for (const [index, item] of array.entries()) {
    try {
      if (await predicate(item, index, array))
        return item
    }
    catch (e) {
      // If we encounter an error, keep searching.
      console.error(`Error predicate: (ignored)\n${e}`)
    }
  }

  // If we do not find any matches, "reject" by raising an error.
  return undefined
}

export const awaitPopout = (page: Page) => expect(page.locator('#popout')).toBeVisible()
