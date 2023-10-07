import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { Database } from '~/types/supabase.types'

const DEFAULT_EMAIL = 'test@capgo.app'
const DEFAULT_PASSWORD = 'testtest'
const START_TIMEOUT = 5000

export const BASE_URL = 'http://localhost:5173'

const defaultSupabaseUrl = 'http://localhost:54321'
const defaultSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
let supaClient: SupabaseClient<Database> = null as any

export async function beforeEachTest({ page }: { page: Page }) {
  // Allow the router to load
  await page.goto(`${BASE_URL}/`)
  await page.waitForTimeout(START_TIMEOUT)
}

export async function useSupabase() {
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

  const { error } = await supaClient.auth.signInWithPassword({
    email: DEFAULT_EMAIL,
    password: DEFAULT_PASSWORD,
  })

  expect(error).toBeNull()

  return supaClient
}
