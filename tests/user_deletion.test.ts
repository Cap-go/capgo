// import { randomUUID } from 'node:crypto'
// import { expect, it } from 'vitest'
// import { getSupabaseClient } from './test-utils'

// // Helper function to hash email
// async function hashEmail(email: string): Promise<string> {
//   const encoder = new TextEncoder()
//   const data = encoder.encode(email)
//   const hashBuffer = await crypto.subtle.digest('SHA-256', data)
//   const hashArray = Array.from(new Uint8Array(hashBuffer))
//   return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
// }

// // Helper function to wait for deleted_account entry
// async function waitForDeletedAccount(supabase: any, hashedEmail: string, maxAttempts = 10) {
//   for (let i = 0; i < maxAttempts; i++) {
//     const { data, error } = await supabase
//       .from('deleted_account')
//       .select('*')
//       .eq('email', hashedEmail)

//     if (error) {
//       console.error('Error checking deleted_account:', error)
//       continue
//     }

//     if (data && data.length > 0) {
//       return true
//     }

//     // Wait 1 second before next attempt
//     await new Promise(resolve => setTimeout(resolve, 1000))
//   }

//   throw new Error('Timeout waiting for deleted_account entry')
// }

// // Helper function to create a test user
// async function createTestUser() {
//   const supabase = getSupabaseClient()
//   const testEmail = `test-${randomUUID()}@example.com`
//   const testPassword = 'password123'

//   const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
//     email: testEmail,
//     password: testPassword,
//   })

//   expect(signUpError).toBeNull()
//   expect(signUpData.user).not.toBeNull()

//   const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
//     email: testEmail,
//     password: testPassword,
//   })

//   expect(signInError).toBeNull()
//   expect(signInData.user).not.toBeNull()

//   if (!signInData.user) {
//     throw new Error('User not found after sign in')
//   }

//   return { supabase, testEmail, user: signInData.user }
// }

// // Test user deletion process using admin SDK
// it('user deletion process with admin SDK', async () => {
//   const { supabase, testEmail, user } = await createTestUser()
//   const hashedEmail = await hashEmail(testEmail)

//   // Delete the user using admin SDK
//   const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
//   expect(deleteError).toBeNull()

//   // Wait for deleted_account entry
//   await waitForDeletedAccount(supabase, hashedEmail)

//   // Verify the user is deleted
//   const { data: userData, error: userError } = await supabase.auth.getUser()
//   expect(userError).not.toBeNull()
//   expect(userData.user).toBeNull()
// })

// // Test user deletion process using RPC
// it('user deletion process with RPC', async () => {
//   const { supabase, testEmail } = await createTestUser()
//   const hashedEmail = await hashEmail(testEmail)

//   // Delete the user using RPC
//   const { error: deleteError } = await supabase.rpc('delete_user')
//   expect(deleteError).toBeNull()

//   // Wait for deleted_account entry
//   await waitForDeletedAccount(supabase, hashedEmail)

//   // Verify the user is deleted
//   const { data: userData, error: userError } = await supabase.auth.getUser()
//   expect(userError).not.toBeNull()
//   expect(userData.user).toBeNull()
// })
