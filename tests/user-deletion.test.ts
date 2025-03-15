import { describe, expect, it } from 'vitest'
import { getSupabaseClient } from './test-utils'
import { createHash } from 'crypto'

describe('User deletion', () => {
  it('should delete a user successfully', async () => {
    // Create a test user
    const email = `test-delete-${Date.now()}@example.com`
    const password = 'testpassword'
    
    const supabase = getSupabaseClient()
    
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })
    
    expect(signUpError).toBeNull()
    expect(signUpData.user).not.toBeNull()
    
    // Sign in as the test user
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    expect(signInError).toBeNull()
    expect(signInData.user).not.toBeNull()
    
    // Call the delete_user function
    const { error: deleteError } = await supabase.rpc('delete_user')
    
    expect(deleteError).toBeNull()
    
    // Verify user is deleted
    const { data: userData, error: userError } = await supabase.auth.getUser()
    
    expect(userError).not.toBeNull()
    expect(userData.user).toBeNull()
    
    // Verify user is in deleted_account table
    const hashedEmail = createHash('sha256').update(email).digest('hex')
    
    const { data: deletedAccounts, error: deletedError } = await supabase
      .from('deleted_account')
      .select('*')
      .eq('email', hashedEmail)
    
    expect(deletedError).toBeNull()
    expect(deletedAccounts?.length).toBe(1)
  })
})
