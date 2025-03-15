import { getSupabaseClient, resetAndSeedAppData } from './utils'
import { describe, expect, it, beforeEach } from 'vitest'

describe('User Deletion', () => {
  // We can't actually test deleting the current user in an automated test
  // So we'll test the related functionality
  
  const APP_ID = 'com.test.user.deletion'
  
  beforeEach(async () => {
    // Reset test data before each test
    await resetAndSeedAppData(APP_ID)
  })

  it('should properly handle the on_user_delete trigger', async () => {
    // Create a test user
    const testEmail = `test-${Date.now()}@example.com`
    const { data: userData, error: createError } = await getSupabaseClient().auth.admin.createUser({
      email: testEmail,
      password: 'password123',
      email_confirm: true
    })
    
    expect(createError).toBeNull()
    expect(userData).toBeTruthy()
    expect(userData.user).toBeTruthy()
    
    const userId = userData.user.id
    
    // Insert the user into public.users table since auth.users doesn't automatically create this
    await getSupabaseClient()
      .from('users')
      .insert({
        id: userId,
        email: testEmail,
        created_at: new Date().toISOString()
      })
    
    // Verify user exists in public.users
    const { data: publicUser, error: publicUserError } = await getSupabaseClient()
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    
    expect(publicUserError).toBeNull()
    expect(publicUser).toBeTruthy()
    
    // Manually trigger the deletion process
    // Note: We can't actually delete from auth.users in a test
    // So we'll simulate the trigger by deleting from public.users
    const { error: deleteError } = await getSupabaseClient()
      .from('users')
      .delete()
      .eq('id', userId)
    
    expect(deleteError).toBeNull()
    
    // Verify user is added to deleted_account table
    const { data: deletedAccount, error: deletedAccountError } = await getSupabaseClient()
      .from('deleted_account')
      .select('*')
      .eq('email', testEmail)
      .single()
    
    expect(deletedAccountError).toBeNull()
    expect(deletedAccount).toBeTruthy()
    expect(deletedAccount.email).toBe(testEmail)
  })

  it('should prevent reuse of deleted email addresses', async () => {
    // Add a test email to deleted_account
    const testEmail = `deleted-${Date.now()}@example.com`
    
    const { error: insertError } = await getSupabaseClient()
      .from('deleted_account')
      .insert({ email: testEmail })
    
    expect(insertError).toBeNull()
    
    // Try to create a user with the same email
    const { data: userData, error: createError } = await getSupabaseClient().auth.admin.createUser({
      email: testEmail,
      password: 'password123',
      email_confirm: true
    })
    
    // This should fail due to the is_not_deleted check
    expect(createError).toBeTruthy()
    expect(userData).toBeNull()
  })
})
