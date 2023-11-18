import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { Database } from '~/types/supabase.types'

const DEFAULT_EMAIL = 'test@capgo.app'
const DEFAULT_PASSWORD = 'testtest'
const START_TIMEOUT = 3000

export const BASE_URL = 'http://localhost:5173'

const defaultSupabaseUrl = 'http://localhost:54321'
const defaultSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const defaultSupabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let supaClient: SupabaseClient<Database> = null as any
let supaClientAdmin: SupabaseClient<Database> = null as any

export type SupabaseType = SupabaseClient<Database>

export async function beforeEachTest({ page }: { page: Page }) {
  // Allow the router to load
  await page.goto(`${BASE_URL}/`)
  await page.waitForTimeout(START_TIMEOUT)
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
  // return createClient<Database>(supabaseUrl, supabaseAnonKey, options)
  if (supaClient)
    return supaClient
  // eslint-disable-next-line n/prefer-global/process
  supaClient = createClient<Database>(process.env.SUPABASE_URL ?? defaultSupabaseUrl, process.env.SUPABASE_ANON ?? defaultSupabaseAnonKey, options)

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
