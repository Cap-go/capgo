import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { getSupabaseClient } from './test-utils'

// Test user deletion process
it('user deletion process', async () => {
  const supabase = getSupabaseClient()
  // Create a test user
  const testEmail = `test-${randomUUID()}@example.com`
  const testPassword = 'password123'

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  })

  expect(signUpError).toBeNull()
  expect(signUpData.user).not.toBeNull()

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
