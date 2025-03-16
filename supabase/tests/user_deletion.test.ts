import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { expect } from 'vitest'

// Test user deletion process
it('user deletion process', async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  )

  // Create a test user
  const testEmail = `test-${uuidv4()}@example.com`
  const testPassword = 'password123'

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  })

  expect(signUpError).toBeNull()
  expect(signUpData.user).not.toBeNull()

  const _userId = signUpData.user?.id

  // Sign in as the test user
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  })

  expect(signInError).toBeNull()
  expect(signInData.user).not.toBeNull()

  // Delete the user
  const { error: deleteError } = await supabase.rpc('delete_user')
  expect(deleteError).toBeNull()

  // Verify the user is deleted
  const { data: userData, error: userError } = await supabase.auth.getUser()
  expect(userError).not.toBeNull()
  expect(userData.user).toBeNull()

  // Verify the user's email is in the deleted_account table
  const { data: deletedAccounts, error: deletedError } = await supabase
    .from('deleted_account')
    .select('*')
    .eq('email', await hashEmail(testEmail))

  expect(deletedError).toBeNull()
  expect(deletedAccounts?.length).toBeGreaterThan(0)
})

// Helper function to hash email
async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(email)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
